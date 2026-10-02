import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

// Read lazily so tests can set variables before first use.
export const config = {
  get port() {
    return Number(process.env.PORT) || 5000;
  },
  get jwtExpiresIn() {
    return process.env.JWT_EXPIRES_IN || "1h";
  },
  get evidenceDir() {
    return path.resolve(process.env.EVIDENCE_DIR || "storage/evidence");
  },
  get maxUploadBytes() {
    return Number(process.env.MAX_UPLOAD_BYTES) || 25 * 1024 * 1024;
  },
  get authRateLimit() {
    return Number(process.env.AUTH_RATE_LIMIT) || 20;
  },
};

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET is missing or too short (min 16 characters)");
  }
  return secret;
}
