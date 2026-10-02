import fs from "node:fs";
import path from "node:path";
import type { Pool } from "pg";

// Applies migrations/*.sql in filename order, each in its own transaction.
// Applied versions are recorded in schema_migrations; nothing is ever dropped.
export async function runMigrations(pool: Pool): Promise<string[]> {
  const dir = path.resolve(process.cwd(), "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];

  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );

  for (const file of files) {
    const done = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1", [file]);
    if (done.rowCount) continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(fs.readFileSync(path.join(dir, file), "utf8").replace(/^\uFEFF/, ""));
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      applied.push(file);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      client.release();
    }
  }
  return applied;
}
