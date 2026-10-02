import fs from "node:fs";
import path from "node:path";
import { sha256File } from "../utils/hash.js";

export type IntegrityResult = "match" | "mismatch" | "unreadable";
export type UnavailableReason = "missing_or_unreadable" | "malformed_recorded_digest" | "unsafe_storage_path";

export interface IntegrityCheck {
  result: IntegrityResult;
  /** Freshly computed digest of the stored bytes; null when the file could not be hashed. */
  computed: string | null;
  /** Set only when result is "unreadable": why verification could not be completed. */
  reason?: UnavailableReason;
}

const SHA256_RE = /^[0-9a-f]{64}$/;
// Storage names are server-generated UUIDs; anything with separators or odd characters is refused outright.
const SAFE_STORAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Resolves a stored file name inside the evidence directory, or null if the name is unsafe. */
export function resolveStoragePath(evidenceDir: string, storedName: string): string | null {
  if (!SAFE_STORAGE_NAME.test(storedName) || storedName.includes("..")) return null;
  const root = path.resolve(evidenceDir);
  const full = path.resolve(root, storedName);
  return path.dirname(full) === root ? full : null;
}

/**
 * Recomputes SHA-256 from the stored bytes and compares it with the recorded digest.
 * "match" is returned only when a file was actually read and its digest equals a well-formed recorded digest.
 * Anything that prevents a real comparison yields "unreadable", never "match" and never "mismatch".
 */
export async function checkStoredFile(evidenceDir: string, storedName: string, recordedDigest: string): Promise<IntegrityCheck> {
  const recorded = recordedDigest.trim();
  if (!SHA256_RE.test(recorded)) return { result: "unreadable", computed: null, reason: "malformed_recorded_digest" };

  const filePath = resolveStoragePath(evidenceDir, storedName);
  if (!filePath) return { result: "unreadable", computed: null, reason: "unsafe_storage_path" };

  let computed: string;
  try {
    if (!(await fs.promises.stat(filePath)).isFile()) throw new Error("not a regular file");
    computed = await sha256File(filePath); // streamed: large files are never loaded into memory
  } catch {
    return { result: "unreadable", computed: null, reason: "missing_or_unreadable" };
  }
  return { result: computed === recorded ? "match" : "mismatch", computed };
}