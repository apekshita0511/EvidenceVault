// MUST be the first import of every test file: points the app at the isolated test DB
// and a temporary evidence directory before any app module reads its config.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.DB_NAME = "evidencevault_test";
process.env.JWT_SECRET = "test-secret-not-for-production-use";
process.env.JWT_EXPIRES_IN = "1h";
process.env.AUTH_RATE_LIMIT = "10000";
process.env.MAX_UPLOAD_BYTES = String(1024 * 1024);
process.env.EVIDENCE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ev-test-"));
