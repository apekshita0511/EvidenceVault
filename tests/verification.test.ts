import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { api, base, setupServer, pool, registerAndLogin, uploadForm } from "./helpers.js";

setupServer();

const ORIGINAL = "original evidence bytes";

async function upload(token: string, content = ORIGINAL) {
  const r = await api("POST", "/api/evidence", { token, form: uploadForm(content) });
  const id: string = r.data.evidence.id;
  const file = path.join(process.env.EVIDENCE_DIR!, (await pool.query("SELECT file_path FROM evidence WHERE id=$1", [id])).rows[0].file_path);
  return { id, file, hash: r.data.evidence.sha256_hash as string };
}
const get = (token: string, id: string) => api("GET", `/api/evidence/${id}`, { token }).then((r) => r.data.evidence);
const stats = (token: string) => api("GET", "/api/evidence/stats", { token }).then((r) => r.data.stats);
const events = async (id: string) =>
  (await pool.query("SELECT action FROM chain_of_custody WHERE evidence_id=$1 ORDER BY id", [id])).rows.map((r) => r.action);
const verifyAudits = async (id: string) =>
  (await pool.query("SELECT details FROM audit_logs WHERE action='evidence.verify' AND entity_id=$1 ORDER BY id", [id])).rows.map((r) => r.details);

describe("verification workflow", () => {
  it("is 'not verified' (null) until a real verification has run, and registration never counts as one", async () => {
    const u = await registerAndLogin();
    const { id } = await upload(u.token);
    const ev = await get(u.token, id);
    assert.equal(ev.integrity, null);
    assert.equal(ev.last_verified_at, null);
    assert.deepEqual(await stats(u.token), { total: 1, verified: 0, failed: 0, unverified: 1, recent_uploads: 1 });
    assert.deepEqual(await events(id), ["registered"]);
  });

  it("match: recomputes from the stored file and persists the result everywhere the UI reads it", async () => {
    const u = await registerAndLogin();
    const { id, hash } = await upload(u.token);
    const r = await api("POST", `/api/evidence/${id}/verify`, { token: u.token });
    assert.equal(r.status, 200);
    assert.equal(r.data.result, "match");
    assert.equal(r.data.computed_sha256, hash);
    assert.equal(r.data.recorded_sha256, hash);

    const ev = await get(u.token, id);
    assert.equal(ev.integrity, "match");
    assert.ok(ev.last_verified_at);
    assert.equal(ev.sha256_hash, hash, "recorded digest is never rewritten by verification");
    const list = await api("GET", "/api/evidence", { token: u.token });
    assert.equal(list.data.evidence[0].integrity, "match");
    assert.deepEqual(await stats(u.token), { total: 1, verified: 1, failed: 0, unverified: 0, recent_uploads: 1 });
    assert.deepEqual(await events(id), ["registered", "integrity_match"]);
    assert.equal((await verifyAudits(id))[0].result, "match");
  });

  it("mismatch: persisted as failed; a later match (file restored) supersedes it", async () => {
    const u = await registerAndLogin();
    const { id, file } = await upload(u.token);
    fs.appendFileSync(file, "tampered");
    const bad = await api("POST", `/api/evidence/${id}/verify`, { token: u.token });
    assert.equal(bad.status, 200);
    assert.equal(bad.data.result, "mismatch");
    assert.notEqual(bad.data.computed_sha256, bad.data.recorded_sha256);
    assert.equal((await get(u.token, id)).integrity, "mismatch");
    assert.deepEqual(await stats(u.token), { total: 1, verified: 0, failed: 1, unverified: 0, recent_uploads: 1 });

    fs.writeFileSync(file, ORIGINAL); // controlled test restore of the original bytes
    assert.equal((await api("POST", `/api/evidence/${id}/verify`, { token: u.token })).data.result, "match");
    assert.equal((await get(u.token, id)).integrity, "match");
    assert.deepEqual(await events(id), ["registered", "integrity_mismatch", "integrity_match"], "history keeps every check");
  });

  it("missing file: 409, persisted as failed ('unreadable'), never reported as verified", async () => {
    const u = await registerAndLogin();
    const { id, file } = await upload(u.token);
    fs.unlinkSync(file);
    const r = await api("POST", `/api/evidence/${id}/verify`, { token: u.token });
    assert.equal(r.status, 409);
    assert.equal(r.data.result, "unreadable");
    assert.equal((await get(u.token, id)).integrity, "unreadable");
    assert.deepEqual(await stats(u.token), { total: 1, verified: 0, failed: 1, unverified: 0, recent_uploads: 1 });
    assert.deepEqual(await events(id), ["registered", "integrity_unreadable"]);
  });

  it("each request records exactly one custody event and one audit entry", async () => {
    const u = await registerAndLogin();
    const { id } = await upload(u.token);
    for (let i = 0; i < 3; i++) await api("POST", `/api/evidence/${id}/verify`, { token: u.token });
    assert.equal((await events(id)).filter((a) => a === "integrity_match").length, 3);
    assert.equal((await verifyAudits(id)).length, 3);
  });

  it("rejected requests write nothing: no token, bad token, other user's evidence, malformed or unknown id", async () => {
    const owner = await registerAndLogin();
    const other = await registerAndLogin();
    const { id } = await upload(owner.token);

    assert.equal((await api("POST", `/api/evidence/${id}/verify`)).status, 401);
    assert.equal((await api("POST", `/api/evidence/${id}/verify`, { token: "garbage" })).status, 401);
    assert.equal((await api("POST", `/api/evidence/${id}/verify`, { token: other.token })).status, 404);
    assert.equal((await api("POST", "/api/evidence/abc/verify", { token: owner.token })).status, 404);
    assert.equal((await api("POST", "/api/evidence/999999999/verify", { token: owner.token })).status, 404);

    assert.deepEqual(await events(id), ["registered"]);
    assert.equal((await verifyAudits(id)).length, 0);
    assert.equal((await get(owner.token, id)).integrity, null);
  });

  it("API responses are never cacheable (dashboard data cannot go stale in the browser)", async () => {
    const u = await registerAndLogin();
    for (const p of ["/api/evidence/stats", "/api/evidence", "/api/custody", "/api/audit"]) {
      const res = await fetch(base + p, { headers: { authorization: `Bearer ${u.token}` } });
      assert.equal(res.headers.get("cache-control"), "no-store", p);
    }
  });
});