import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { api, setupServer, pool, registerAndLogin, uploadForm } from "./helpers.js";

setupServer();

const dir = () => process.env.EVIDENCE_DIR!;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

async function upload(token: string, content = "hello evidence", fields: Record<string, string> = {}) {
  return api("POST", "/api/evidence", { token, form: uploadForm(content, fields) });
}

describe("upload", () => {
  it("requires authentication", async () => {
    assert.equal((await api("POST", "/api/evidence", { form: uploadForm("x") })).status, 401);
  });
  it("computes SHA-256 server-side, ignoring a client-supplied hash, and uses a safe storage name", async () => {
    const u = await registerAndLogin();
    const r = await upload(u.token, "hello evidence", { sha256_hash: "0".repeat(64) });
    assert.equal(r.status, 201);
    assert.equal(r.data.evidence.sha256_hash, sha("hello evidence"));
    assert.equal(r.data.evidence.original_filename, "evil name.bin", "path components in client filename are stripped");
    const row = await pool.query("SELECT file_path FROM evidence WHERE id=$1", [r.data.evidence.id]);
    assert.match(row.rows[0].file_path, /^[0-9a-f-]{36}$/);
    assert.ok(fs.existsSync(path.join(dir(), row.rows[0].file_path)));
  });
  it("records custody and audit rows for registration", async () => {
    const u = await registerAndLogin();
    const r = await upload(u.token);
    const id = r.data.evidence.id;
    const c = await pool.query("SELECT action, from_user_id::text AS actor FROM chain_of_custody WHERE evidence_id=$1", [id]);
    assert.deepEqual(c.rows, [{ action: "registered", actor: u.id }]);
    const a = await pool.query("SELECT action FROM audit_logs WHERE entity_type='evidence' AND entity_id=$1", [id]);
    assert.deepEqual(a.rows.map((x) => x.action), ["evidence.register"]);
  });
  it("stores same-named uploads as separate files", async () => {
    const u = await registerAndLogin();
    const a = await upload(u.token, "one");
    const b = await upload(u.token, "two");
    const rows = await pool.query("SELECT DISTINCT file_path FROM evidence WHERE id = ANY($1::bigint[])", [[a.data.evidence.id, b.data.evidence.id]]);
    assert.equal(rows.rowCount, 2);
  });
  it("rejects missing file, empty file, and missing fields, leaving no orphan files", async () => {
    const u = await registerAndLogin();
    const before = fs.readdirSync(dir()).length;
    const noFile = new FormData(); noFile.set("title", "t"); noFile.set("evidence_type", "x");
    assert.equal((await api("POST", "/api/evidence", { token: u.token, form: noFile })).status, 400);
    assert.equal((await upload(u.token, "")).status, 400);
    const noTitle = uploadForm("data"); noTitle.set("title", "  ");
    assert.equal((await api("POST", "/api/evidence", { token: u.token, form: noTitle })).status, 400);
    assert.equal(fs.readdirSync(dir()).length, before);
  });
  it("enforces the size limit with 413 and leaves no partial file", async () => {
    const u = await registerAndLogin();
    const before = fs.readdirSync(dir()).length;
    const r = await upload(u.token, Buffer.alloc(2 * 1024 * 1024, 1));
    assert.equal(r.status, 413);
    assert.equal(fs.readdirSync(dir()).length, before);
  });
});

describe("access control", () => {
  it("hides other users' evidence (404) and records the denial", async () => {
    const owner = await registerAndLogin();
    const other = await registerAndLogin();
    const id = (await upload(owner.token)).data.evidence.id;
    for (const [m, p] of [["GET", ""], ["GET", "/download"], ["POST", "/verify"]]) {
      assert.equal((await api(m, `/api/evidence/${id}${p}`, { token: other.token })).status, 404, p);
    }
    assert.equal((await api("GET", "/api/evidence/999999999", { token: other.token })).status, 404);
    assert.equal((await api("GET", "/api/evidence/abc", { token: other.token })).status, 404);
    const list = await api("GET", "/api/evidence", { token: other.token });
    assert.deepEqual(list.data.evidence, []);
    const denied = await pool.query("SELECT 1 FROM audit_logs WHERE action='evidence.access_denied' AND user_id=$1", [other.id]);
    assert.ok(denied.rowCount! >= 3);
  });
  it("owner can list, read detail with custody trail, and download", async () => {
    const u = await registerAndLogin();
    const id = (await upload(u.token, "download me")).data.evidence.id;
    assert.equal((await api("GET", "/api/evidence", { token: u.token })).data.evidence.length, 1);
    const d = await api("GET", `/api/evidence/${id}`, { token: u.token });
    assert.equal(d.status, 200);
    assert.equal(d.data.chain_of_custody[0].action, "registered");
    const res = await fetch(`${(await import("./helpers.js")).base}/api/evidence/${id}/download`, { headers: { authorization: `Bearer ${u.token}` } });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "download me");
    const c = await pool.query("SELECT 1 FROM chain_of_custody WHERE evidence_id=$1 AND action='accessed'", [id]);
    assert.equal(c.rowCount, 1);
  });
});

describe("integrity verification", () => {
  it("reports match for unchanged evidence and records the event", async () => {
    const u = await registerAndLogin();
    const id = (await upload(u.token, "original bytes")).data.evidence.id;
    const r = await api("POST", `/api/evidence/${id}/verify`, { token: u.token });
    assert.equal(r.status, 200);
    assert.equal(r.data.result, "match");
    const c = await pool.query("SELECT 1 FROM chain_of_custody WHERE evidence_id=$1 AND action='integrity_match'", [id]);
    const a = await pool.query("SELECT details FROM audit_logs WHERE action='evidence.verify' AND entity_id=$1", [id]);
    assert.equal(c.rowCount, 1);
    assert.equal(a.rows[0].details.result, "match");
  });
  it("reports mismatch after the stored file is altered", async () => {
    const u = await registerAndLogin();
    const id = (await upload(u.token, "original bytes")).data.evidence.id;
    const fp = (await pool.query("SELECT file_path FROM evidence WHERE id=$1", [id])).rows[0].file_path;
    fs.appendFileSync(path.join(dir(), fp), "tampered");
    const r = await api("POST", `/api/evidence/${id}/verify`, { token: u.token });
    assert.equal(r.status, 200);
    assert.equal(r.data.result, "mismatch");
    assert.notEqual(r.data.computed_sha256, r.data.recorded_sha256);
    const c = await pool.query("SELECT 1 FROM chain_of_custody WHERE evidence_id=$1 AND action='integrity_mismatch'", [id]);
    assert.equal(c.rowCount, 1);
  });
  it("handles a missing stored file safely", async () => {
    const u = await registerAndLogin();
    const id = (await upload(u.token)).data.evidence.id;
    const fp = (await pool.query("SELECT file_path FROM evidence WHERE id=$1", [id])).rows[0].file_path;
    fs.unlinkSync(path.join(dir(), fp));
    const r = await api("POST", `/api/evidence/${id}/verify`, { token: u.token });
    assert.equal(r.status, 409);
    assert.equal(r.data.result, "unreadable");
    assert.equal(JSON.stringify(r.data).includes(dir()), false, "must not leak filesystem paths");
    assert.equal((await api("GET", `/api/evidence/${id}/download`, { token: u.token })).status, 500);
  });
});

describe("append-only history", () => {
  it("blocks UPDATE, DELETE and TRUNCATE on audit_logs and chain_of_custody", async () => {
    const u = await registerAndLogin();
    await upload(u.token); // guarantees rows exist so row-level triggers fire
    for (const sql of [
      "UPDATE audit_logs SET action='x'", "DELETE FROM audit_logs", "TRUNCATE audit_logs",
      "UPDATE chain_of_custody SET action='x'", "DELETE FROM chain_of_custody", "TRUNCATE chain_of_custody",
    ]) {
      await assert.rejects(pool.query(sql), /append-only/, sql);
    }
  });
});