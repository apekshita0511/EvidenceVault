import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { pool } from "../config/database.js";
import { config } from "../config/env.js";
import { recordAudit, recordCustody } from "../services/audit.service.js";
import { sha256File } from "../utils/hash.js";

// "integrity" is derived from the most recent verification event in chain_of_custody:
// match | mismatch | unreadable, or null if the evidence was never verified.
const LATEST_VERIFY = `LEFT JOIN LATERAL (
    SELECT action, recorded_at FROM chain_of_custody c
    WHERE c.evidence_id = e.id AND c.action LIKE 'integrity\\_%'
    ORDER BY c.id DESC LIMIT 1
  ) li ON true`;
const SELECT = `SELECT e.id::text AS id, e.title, e.description, e.evidence_type, e.sha256_hash, e.status,
  e.uploaded_by::text AS uploaded_by, u.name AS uploaded_by_name, e.original_filename, e.mime_type,
  e.size_bytes::text AS size_bytes, e.created_at, e.updated_at,
  substr(li.action, 11) AS integrity, li.recorded_at AS last_verified_at`;
const FROM = `FROM evidence e JOIN users u ON u.id = e.uploaded_by ${LATEST_VERIFY}`;

const parseId = (v: unknown) => (typeof v === "string" && /^\d{1,18}$/.test(v) ? v : null);
const storedPath = (fileName: string) => path.join(config.evidenceDir, path.basename(fileName));
const removeQuietly = (p: string) => fs.promises.unlink(p).catch(() => undefined);

// Admins see everything; other users only see evidence they uploaded.
// Unauthorized and nonexistent are indistinguishable (both 404).
async function findAccessible(req: Request, res: Response, extraColumns = "") {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(404).json({ success: false, message: "Evidence not found" });
    return null;
  }
  const result = await pool.query(`${SELECT}${extraColumns} ${FROM} WHERE e.id = $1`, [id]);
  const row = result.rows[0];
  if (!row || (req.user!.role !== "admin" && row.uploaded_by !== req.user!.id)) {
    if (row) {
      await recordAudit({
        userId: req.user!.id,
        action: "evidence.access_denied",
        entityType: "evidence",
        entityId: id,
        details: { path: req.path },
      });
    }
    res.status(404).json({ success: false, message: "Evidence not found" });
    return null;
  }
  return row;
}

export const createEvidence = async (req: Request, res: Response) => {
  const file = req.file;
  const user = req.user!;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = text(req.body?.title);
  const evidenceType = text(req.body?.evidence_type);
  const description = text(req.body?.description) || null;

  const reject = async (status: number, message: string) => {
    if (file) await removeQuietly(file.path);
    return res.status(status).json({ success: false, message });
  };

  if (!file) return reject(400, "A file is required (multipart field 'file')");
  if (file.size === 0) return reject(400, "Empty files are not accepted");
  if (!title || title.length > 255) return reject(400, "Title is required (max 255 characters)");
  if (!evidenceType || evidenceType.length > 100) return reject(400, "evidence_type is required (max 100 characters)");

  // Hash is computed from the bytes the server actually stored; any client-supplied hash is ignored.
  let hash: string;
  try {
    hash = await sha256File(file.path);
  } catch (error) {
    await removeQuietly(file.path);
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO evidence (title, description, evidence_type, file_path, sha256_hash, uploaded_by,
                             original_filename, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id::text AS id`,
      [title, description, evidenceType, file.filename, hash, user.id,
       file.originalname.slice(0, 255), file.mimetype.slice(0, 255), file.size]
    );
    const created = await client.query(`${SELECT} ${FROM} WHERE e.id = $1`, [inserted.rows[0].id]);
    const row = created.rows[0];
    await recordCustody(row.id, "registered", user.id, "Evidence registered and SHA-256 recorded", client);
    await recordAudit(
      { userId: user.id, action: "evidence.register", entityType: "evidence", entityId: row.id,
        details: { sha256: hash, size_bytes: file.size } },
      client
    );
    await client.query("COMMIT");
    return res.status(201).json({ success: true, message: "Evidence registered", evidence: row });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    await removeQuietly(file.path); // nothing was registered, so the new file is orphaned
    throw error;
  } finally {
    client.release();
  }
};

const INTEGRITY_FILTERS: Record<string, string> = {
  verified: "li.action = 'integrity_match'",
  failed: "li.action IN ('integrity_mismatch', 'integrity_unreadable')",
  unverified: "li.action IS NULL",
};
const SORTS: Record<string, string> = {
  created_at: "e.created_at", title: "e.title", evidence_type: "e.evidence_type", size_bytes: "e.size_bytes",
};

const queryString = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const intParam = (v: unknown, fallback: number, max: number) => {
  const n = Number.parseInt(queryString(v), 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
};

// Admins see everything; other users only their own uploads. All filters are parameterized
// and sort columns come from a fixed whitelist.
export const listEvidence = async (req: Request, res: Response) => {
  const user = req.user!;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replaceAll("?", `$${params.length}`)); };

  if (user.role !== "admin") add("e.uploaded_by = ?", user.id);
  const q = queryString(req.query.q);
  if (q) add("(e.title ILIKE ? OR e.original_filename ILIKE ?)", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  const type = queryString(req.query.type);
  if (type) add("e.evidence_type = ?", type);
  const integrity = queryString(req.query.integrity);
  if (integrity) {
    if (!INTEGRITY_FILTERS[integrity]) return res.status(400).json({ success: false, message: "Invalid integrity filter" });
    where.push(INTEGRITY_FILTERS[integrity]);
  }

  const sortKey = queryString(req.query.sort) || "created_at";
  if (!SORTS[sortKey]) return res.status(400).json({ success: false, message: "Invalid sort field" });
  const dir = queryString(req.query.dir).toLowerCase() === "asc" ? "ASC" : "DESC";
  const pageSize = Math.max(1, intParam(req.query.page_size, 20, 100));
  const page = Math.max(1, intParam(req.query.page, 1, 100000));
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows, count] = await Promise.all([
    pool.query(
      `${SELECT} ${FROM} ${clause} ORDER BY ${SORTS[sortKey]} ${dir}, e.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params
    ),
    pool.query(`SELECT count(*)::int AS total ${FROM} ${clause}`, params),
  ]);
  res.status(200).json({ success: true, evidence: rows.rows, total: count.rows[0].total, page, page_size: pageSize });
};

// Option source for the UI: distinct evidence types visible to the caller and the upload size limit.
export const evidenceOptions = async (req: Request, res: Response) => {
  const user = req.user!;
  const result = user.role === "admin"
    ? await pool.query("SELECT DISTINCT evidence_type FROM evidence ORDER BY 1")
    : await pool.query("SELECT DISTINCT evidence_type FROM evidence WHERE uploaded_by = $1 ORDER BY 1", [user.id]);
  res.status(200).json({ success: true, types: result.rows.map((r) => r.evidence_type), max_upload_bytes: config.maxUploadBytes });
};

// "verified" = most recent verification matched; "failed" = most recent was a mismatch or unreadable;
// "unverified" = never verified through the API.
export const evidenceStats = async (req: Request, res: Response) => {
  const user = req.user!;
  const scope = user.role === "admin" ? "" : "WHERE e.uploaded_by = $1";
  const result = await pool.query(
    `SELECT count(*)::int AS total,
            (count(*) FILTER (WHERE li.action = 'integrity_match'))::int AS verified,
            (count(*) FILTER (WHERE li.action IN ('integrity_mismatch','integrity_unreadable')))::int AS failed,
            (count(*) FILTER (WHERE li.action IS NULL))::int AS unverified,
            (count(*) FILTER (WHERE e.created_at > now() - interval '7 days'))::int AS recent_uploads
     FROM evidence e ${LATEST_VERIFY} ${scope}`,
    user.role === "admin" ? [] : [user.id]
  );
  res.status(200).json({ success: true, stats: result.rows[0] });
};
export const getEvidence = async (req: Request, res: Response) => {
  const row = await findAccessible(req, res);
  if (!row) return;
  const custody = await pool.query(
    `SELECT id::text AS id, action, from_user_id::text AS from_user_id, notes, recorded_at
     FROM chain_of_custody WHERE evidence_id = $1 ORDER BY id`,
    [row.id]
  );
  res.status(200).json({ success: true, evidence: row, chain_of_custody: custody.rows });
};

export const downloadEvidence = async (req: Request, res: Response) => {
  const row = await findAccessible(req, res, ", e.file_path");
  if (!row) return;
  const filePath = storedPath(row.file_path);
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch {
    return res.status(500).json({ success: false, message: "Stored file is unavailable" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await recordCustody(row.id, "accessed", req.user!.id, "Evidence file downloaded", client);
    await recordAudit({ userId: req.user!.id, action: "evidence.download", entityType: "evidence", entityId: row.id }, client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  res.download(filePath, row.original_filename ?? `evidence-${row.id}`);
};

export const verifyEvidence = async (req: Request, res: Response) => {
  const row = await findAccessible(req, res, ", e.file_path");
  if (!row) return;

  let result: "match" | "mismatch" | "unreadable";
  let actual: string | null = null;
  try {
    actual = await sha256File(storedPath(row.file_path));
    result = actual === row.sha256_hash ? "match" : "mismatch";
  } catch {
    result = "unreadable";
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await recordCustody(row.id, `integrity_${result}`, req.user!.id, `Integrity verification result: ${result}`, client);
    await recordAudit(
      { userId: req.user!.id, action: "evidence.verify", entityType: "evidence", entityId: row.id,
        details: { result, recorded_sha256: row.sha256_hash, computed_sha256: actual } },
      client
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const note =
    "A match means the checked bytes equal the recorded hash. It does not prove when, where or by whom the evidence originated.";
  if (result === "unreadable") {
    return res.status(409).json({ success: false, result, message: "Stored file is missing or unreadable", note });
  }
  return res.status(200).json({
    success: true,
    result,
    recorded_sha256: row.sha256_hash,
    computed_sha256: actual,
    note,
  });
};
