import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pool } from "./config/database.js";
import authRoutes from "./auth/auth.routes.js";
import evidenceRoutes from "./evidence/evidence.routes.js";
import activityRoutes from "./activity/activity.routes.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? false }));
app.use(express.json({ limit: "1mb" }));

// Authenticated API data must never be served from a browser or proxy cache.
// Access log records method, path (no query string) and status only: never bodies or tokens.
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (process.env.NODE_ENV !== "test") {
    const started = Date.now();
    res.on("finish", () => console.log(`${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${Date.now() - started}ms`));
  }
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/evidence", evidenceRoutes);
app.use("/api", activityRoutes);

// API health check
app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "EvidenceVault API is running",
    timestamp: new Date().toISOString(),
  });
});

// PostgreSQL health check
app.get("/db-health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS time");

    res.status(200).json({
      success: true,
      message: "PostgreSQL connected successfully",
      database: process.env.DB_NAME || "evidencevault",
      time: result.rows[0].time,
    });
  } catch (error) {
    console.error(
      "Database connection failed:",
      error instanceof Error ? error.message : "unknown error"
    );

    res.status(500).json({
      success: false,
      message: "PostgreSQL connection failed",
    });
  }
});

// Built React app (frontend/dist). Only served if it has been built; uploaded evidence is never served from here.
const webRoot = path.resolve(process.cwd(), "frontend", "dist");
if (fs.existsSync(path.join(webRoot, "index.html"))) {
  app.use(express.static(webRoot));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webRoot, "index.html")));
}

app.use(notFound);
app.use(errorHandler);
