import crypto from "node:crypto";
import fs from "node:fs";
import multer from "multer";
import { config } from "../config/env.js";

fs.mkdirSync(config.evidenceDir, { recursive: true });

// Stored under a random server-generated name: the client filename is kept
// only as metadata and never used to build a filesystem path.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.evidenceDir),
  filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
});

export const uploadEvidenceFile = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 10, fieldSize: 10 * 1024 },
}).single("file");
