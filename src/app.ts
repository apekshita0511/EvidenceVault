import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pool } from "./config/database.js";
import authRoutes from "./auth/auth.routes.js";
import evidenceRoutes from "./evidence/evidence.routes.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? false }));
app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/evidence", evidenceRoutes);

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

app.use(notFound);
app.use(errorHandler);
