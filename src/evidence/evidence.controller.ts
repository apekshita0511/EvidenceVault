import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { pool } from "../config/database.js";
import { config } from "../config/env.js";
import { recordAudit, recordCustody } from "../services/audit.service.js";
import { sha256File } from "../utils/hash.js";

const COLUMNS = `id::text AS id, title, description, evidence_type, sha256_hash, status,
  uploaded_by::text AS uploaded_by, original_filename, mime_type, size_bytes::text AS size_bytes,
  created_at, updated_at`;

const parseId = (v: unknown) => (typeof v === "string" && /^\d{1,18}$/.test(v) ? v : null);
const storedPath = (fileName: string) => path.join(config.evidenceDir, path.basename(fileName));
const removeQuietly = (p: string) => fs.promises.unlink(p).catch(() => undefined);

// Admins see everything; other users only see evidence they uploaded.
// Unauthorized and nonexistent are indistinguishable (both 404).
async function findAccessible(req: Request, res: Response, columns: string) {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(404).json({ success: false, message: "Evidence not found" });
    return null;
  }
  const result = await pool.query(`SELECT ${columns} FROM evidence WHERE id = $1`, [id]);
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
       RETURNING ${COLUMNS}`,
      [title, description, evidenceType, file.filename, hash, user.id,
       file.originalname.slice(0, 255), file.mimetype.slice(0, 255), file.size]
    );
    const row = inserted.rows[0];
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

export const listEvidence = async (req: Request, res: Response) => {
  const user = req.user!;
  const result =
    user.role === "admin"
      ? await pool.query(`SELECT ${COLUMNS} FROM evidence ORDER BY created_at DESC, id DESC LIMIT 200`)
      : await pool.query(
          `SELECT ${COLUMNS} FROM evidence WHERE uploaded_by = $1 ORDER BY created_at DESC, id DESC LIMIT 200`,
          [user.id]
        );
  res.status(200).json({ success: true, evidence: result.rows });
};

export const getEvidence = async (req: Request, res: Response) => {
  const row = await findAccessible(req, res, COLUMNS);
  if (!row) return;
  const custody = await pool.query(
    `SELECT id::text AS id, action, from_user_id::text AS from_user_id, notes, recorded_at
     FROM chain_of_custody WHERE evidence_id = $1 ORDER BY id`,
    [row.id]
  );
  res.status(200).json({ success: true, evidence: row, chain_of_custody: custody.rows });
};

export const downloadEvidence = async (req: Request, res: Response) => {
  const row = await findAccessible(req, res, `${COLUMNS}, file_path`);
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
  const row = await findAccessible(req, res, `${COLUMNS}, file_path`);
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
