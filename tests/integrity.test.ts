// Isolated tests: temporary files only. No database, no real evidence directory.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkStoredFile, resolveStoragePath } from "../src/services/integrity.service.js";

const sha = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
let dir: string;
before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "ev-integrity-")); });
after(() => { fs.rmSync(dir, { recursive: true, force: true }); }); // only the temp dir this test created

describe("checkStoredFile", () => {
  it("Test A: unmodified file -> match, computed digest equals recorded digest", async () => {
    const bytes = "known test bytes\n";
    fs.writeFileSync(path.join(dir, "a.bin"), bytes);
    const r = await checkStoredFile(dir, "a.bin", sha(bytes));
    assert.equal(r.result, "match");
    assert.equal(r.computed, sha(bytes));
  });

  it("Test B: file modified after its digest was recorded -> mismatch, computed digest differs", async () => {
    const original = "original contents";
    const file = path.join(dir, "b.bin");
    fs.writeFileSync(file, original);
    const recorded = sha(original);
    assert.equal((await checkStoredFile(dir, "b.bin", recorded)).result, "match");

    fs.writeFileSync(file, "original contentz"); // one byte changed
    const r = await checkStoredFile(dir, "b.bin", recorded);
    assert.equal(r.result, "mismatch");
    assert.equal(r.computed, sha("original contentz"));
    assert.notEqual(r.computed, recorded);
  });

  it("Test B (append): appended bytes are detected", async () => {
    const file = path.join(dir, "b2.bin");
    fs.writeFileSync(file, "abc");
    const recorded = sha("abc");
    fs.appendFileSync(file, "d");
    assert.equal((await checkStoredFile(dir, "b2.bin", recorded)).result, "mismatch");
  });

  it("Test C: missing file -> unreadable, never match", async () => {
    const r = await checkStoredFile(dir, "does-not-exist.bin", sha("x"));
    assert.equal(r.result, "unreadable");
    assert.equal(r.computed, null);
    assert.equal(r.reason, "missing_or_unreadable");
  });

  it("a directory in place of the file is unreadable, not a match", async () => {
    fs.mkdirSync(path.join(dir, "adir"));
    assert.equal((await checkStoredFile(dir, "adir", sha("x"))).result, "unreadable");
  });

  it("malformed recorded digests never produce a match (even for an empty file)", async () => {
    fs.writeFileSync(path.join(dir, "empty.bin"), "");
    for (const bad of ["", "abc", "z".repeat(64), sha("").toUpperCase(), sha("") + "0", " ".repeat(64)]) {
      const r = await checkStoredFile(dir, "empty.bin", bad);
      assert.equal(r.result, "unreadable", JSON.stringify(bad));
      assert.equal(r.reason, "malformed_recorded_digest");
    }
    assert.equal((await checkStoredFile(dir, "empty.bin", sha(""))).result, "match");
  });

  it("unsafe stored names are refused (path traversal)", async () => {
    fs.writeFileSync(path.join(dir, "..", `outside-${path.basename(dir)}.txt`), "outside");
    const outside = `outside-${path.basename(dir)}.txt`;
    try {
      for (const name of [`../${outside}`, "..\\x", "/etc/passwd", "a/b", "sub/../a.bin", "..", ".", "", "C:\\Windows\\win.ini", "a.bin\0"]) {
        const r = await checkStoredFile(dir, name, sha("outside"));
        assert.equal(r.result, "unreadable", JSON.stringify(name));
        assert.equal(r.reason, "unsafe_storage_path");
      }
    } finally { fs.rmSync(path.join(dir, "..", outside), { force: true }); }
  });

  it("hashes a large file by streaming and still detects a one-byte change at the end", async () => {
    const file = path.join(dir, "large.bin");
    const chunk = crypto.randomBytes(1024 * 1024);
    const h = crypto.createHash("sha256");
    const fd = fs.openSync(file, "w");
    for (let i = 0; i < 24; i++) { fs.writeSync(fd, chunk); h.update(chunk); }
    fs.closeSync(fd);
    const recorded = h.digest("hex");
    assert.equal((await checkStoredFile(dir, "large.bin", recorded)).result, "match");
    const fd2 = fs.openSync(file, "r+");
    fs.writeSync(fd2, Buffer.from([chunk[chunk.length - 1]! ^ 0xff]), 0, 1, 24 * 1024 * 1024 - 1);
    fs.closeSync(fd2);
    assert.equal((await checkStoredFile(dir, "large.bin", recorded)).result, "mismatch");
  });
});

describe("resolveStoragePath", () => {
  it("accepts server-generated names and keeps them inside the evidence directory", () => {
    const p = resolveStoragePath(dir, crypto.randomUUID());
    assert.ok(p && path.dirname(p) === path.resolve(dir));
  });
});