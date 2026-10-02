// Recreates the isolated test database. The name is hardcoded and checked so this
// can never touch the development database.
import "../src/config/env.js";
import pg from "pg";
import { runMigrations } from "../src/scripts/migrator.js";

const TEST_DB = "evidencevault_test";
const base = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
};

if (process.env.DB_NAME === TEST_DB) throw new Error("Refusing to run with DB_NAME set to the test database name");

const admin = new pg.Client({ ...base, database: "postgres" });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${TEST_DB}`);
await admin.end();

const pool = new pg.Pool({ ...base, database: TEST_DB });
console.log("Test DB migrations applied:", (await runMigrations(pool)).join(", "));
await pool.end();
