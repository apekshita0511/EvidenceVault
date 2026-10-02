import type { PoolClient } from "pg";
import { pool } from "../config/database.js";

type Db = Pick<PoolClient, "query">;

export interface AuditEntry {
  userId: number | string | null;
  action: string;
  entityType: string;
  entityId?: number | string | null;
  details?: Record<string, unknown>;
}

// Timestamps come from the database default (now()), never from the client.
export async function recordAudit(entry: AuditEntry, db: Db = pool): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [entry.userId, entry.action, entry.entityType, entry.entityId ?? null, JSON.stringify(entry.details ?? {})]
  );
}

export async function recordCustody(
  evidenceId: number | string,
  action: string,
  actorId: number | string,
  notes: string | null,
  db: Db = pool
): Promise<void> {
  await db.query(
    `INSERT INTO chain_of_custody (evidence_id, action, from_user_id, notes)
     VALUES ($1, $2, $3, $4)`,
    [evidenceId, action, actorId, notes]
  );
}
