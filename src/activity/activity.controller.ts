import type { Request, Response } from "express";
import { pool } from "../config/database.js";

const intParam = (v: unknown, fallback: number, max: number) => {
  const n = Number.parseInt(typeof v === "string" ? v : "", 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
};

// Audit entries: admins see all, other users only entries they caused.
export const listAudit = async (req: Request, res: Response) => {
  const user = req.user!;
  const limit = Math.max(1, intParam(req.query.limit, 25, 100));
  const offset = intParam(req.query.offset, 0, 1_000_000);
  const conds: string[] = [];
  const scopeParams: unknown[] = [];
  if (user.role !== "admin") { scopeParams.push(user.id); conds.push(`a.user_id = $${scopeParams.length}`); }
  // Optional filter to one evidence item (still limited by the scope above).
  const evidenceId = typeof req.query.evidence_id === "string" ? req.query.evidence_id : "";
  if (evidenceId) {
    if (!/^\d{1,18}$/.test(evidenceId)) return res.status(400).json({ success: false, message: "Invalid evidence_id" });
    scopeParams.push(evidenceId);
    conds.push(`a.entity_type = 'evidence' AND a.entity_id = $${scopeParams.length}`);
  }
  const scope = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT a.id::text AS id, a.action, a.entity_type, a.entity_id::text AS entity_id, a.details,
              a.created_at, a.user_id::text AS user_id, u.name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       ${scope} ORDER BY a.id DESC LIMIT ${limit} OFFSET ${offset}`,
      scopeParams
    ),
    pool.query(`SELECT count(*)::int AS total FROM audit_logs a ${scope}`, scopeParams),
  ]);
  res.status(200).json({ success: true, entries: rows.rows, total: count.rows[0].total });
};

const CUSTODY_ACTIONS = ["registered", "accessed", "integrity_match", "integrity_mismatch", "integrity_unreadable"];

// Custody events for evidence the caller may access.
export const listCustody = async (req: Request, res: Response) => {
  const user = req.user!;
  const limit = Math.max(1, intParam(req.query.limit, 25, 100));
  const offset = intParam(req.query.offset, 0, 1_000_000);
  const conds: string[] = [];
  const scopeParams: unknown[] = [];
  if (user.role !== "admin") { scopeParams.push(user.id); conds.push(`e.uploaded_by = $${scopeParams.length}`); }
  // Optional filters. "integrity" groups every verification outcome.
  const evidenceId = typeof req.query.evidence_id === "string" ? req.query.evidence_id : "";
  if (evidenceId) {
    if (!/^\d{1,18}$/.test(evidenceId)) return res.status(400).json({ success: false, message: "Invalid evidence_id" });
    scopeParams.push(evidenceId);
    conds.push(`c.evidence_id = $${scopeParams.length}`);
  }
  const action = typeof req.query.action === "string" ? req.query.action : "";
  if (action === "integrity") conds.push(`c.action LIKE 'integrity\\_%'`);
  else if (action) {
    if (!CUSTODY_ACTIONS.includes(action)) return res.status(400).json({ success: false, message: "Invalid action filter" });
    scopeParams.push(action);
    conds.push(`c.action = $${scopeParams.length}`);
  }
  const scope = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT c.id::text AS id, c.evidence_id::text AS evidence_id, e.title AS evidence_title, c.action,
              c.from_user_id::text AS actor_id, u.name AS actor_name, c.notes, c.recorded_at
       FROM chain_of_custody c
       JOIN evidence e ON e.id = c.evidence_id
       LEFT JOIN users u ON u.id = c.from_user_id
       ${scope} ORDER BY c.id DESC LIMIT ${limit} OFFSET ${offset}`,
      scopeParams
    ),
    pool.query(`SELECT count(*)::int AS total FROM chain_of_custody c JOIN evidence e ON e.id = c.evidence_id ${scope}`, scopeParams),
  ]);
  res.status(200).json({ success: true, events: rows.rows, total: count.rows[0].total });
};