import { config, getJwtSecret } from "./config/env.js";
import { pool } from "./config/database.js";
import { app } from "./app.js";

getJwtSecret(); // fail fast if the signing secret is missing

const server = app.listen(config.port, () => {
  console.log(`EvidenceVault API running at http://localhost:${config.port}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
