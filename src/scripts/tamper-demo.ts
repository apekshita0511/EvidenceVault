// Developer-only demonstration of tamper detection.
// Works exclusively in a freshly created temporary directory with generated data: it never reads the
// database or the real evidence directory, and it deletes only the temp directory it created.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkStoredFile } from "../services/integrity.service.js";

const sha = (b: string) => crypto.createHash("sha256").update(b).digest("hex");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evidencevault-demo-"));

async function show(label: string, name: string, recorded: string) {
  const r = await checkStoredFile(dir, name, recorded);
  console.log(`${label.padEnd(26)} -> ${r.result.toUpperCase()}`);
  console.log(`  recorded: ${recorded}`);
  console.log(`  computed: ${r.computed ?? `(none: ${r.reason})`}`);
}

try {
  console.log(`Temporary demo directory: ${dir}\n`);
  const name = crypto.randomUUID();
  const file = path.join(dir, name);
  const original = "Demo evidence: access log excerpt\n";

  fs.writeFileSync(file, original);
  const recorded = sha(original); // what the server would record at upload time
  console.log("1. Evidence registered; digest recorded.\n");

  await show("2. Unmodified file", name, recorded);

  fs.appendFileSync(file, "one extra line added after registration\n");
  console.log("\n3. Demo file modified on disk (temp copy only).\n");
  await show("4. Modified file", name, recorded);

  fs.unlinkSync(file);
  console.log("\n5. Demo file removed (temp copy only).\n");
  await show("6. Missing file", name, recorded);

  console.log("\nA mismatch shows the bytes differ from the recorded digest; it does not show who changed them or when.");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`Temporary directory removed: ${!fs.existsSync(dir)}`);
}