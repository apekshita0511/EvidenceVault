import crypto from "node:crypto";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";

// Streams the file so large evidence is never loaded fully into memory.
export async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest("hex");
}
