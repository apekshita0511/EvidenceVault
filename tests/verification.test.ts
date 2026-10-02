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
    assert.deepEqual(await stats(u.token), { total: 1, verified: 0, mismatch: 0, unavailable: 0, unverified: 1, recent_uploads: 1 });
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
    assert.deepEqual(await stats(u.token), { total: 1, verified: 1, mismatch: 0, unavailable: 0, unverified: 0, recent_uploads: 1 });
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
    assert.deepEqual(await stats(u.token), { total: 1, verified: 0, mismatch: 1, unavailable: 0, unverified: 0, recent_uploads: 1 });

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
    assert.equal(r.data.reason, "missing_or_unreadable");
    assert.match(r.data.message, /does not indicate tampering/);
    assert.deepEqual(await stats(u.token), { total: 1, verified: 0, mismatch: 0, unavailable: 1, unverified: 0, recent_uploads: 1 }, "unavailable is not counted as tampering");
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
describe("digest preservation and tamper evidence", () => {
  const recordedDigest = async (id: string) => (await pool.query("SELECT sha256_hash FROM evidence WHERE id=$1", [id])).rows[0].sha256_hash;

  it("Test E: a mismatch or missing-file result never overwrites the originally recorded digest", async () => {
    const u = await registerAndLogin();
    const { id, file, hash } = await upload(u.token, "digest preservation");
    fs.appendFileSync(file, "tampered");
    assert.equal((await api("POST", `/api/evidence/${id}/verify`, { token: u.token })).data.result, "mismatch");
    assert.equal(await recordedDigest(id), hash);
    fs.unlinkSync(file);
    assert.equal((await api("POST", `/api/evidence/${id}/verify`, { token: u.token })).status, 409);
    assert.equal(await recordedDigest(id), hash);
    assert.equal((await get(u.token, id)).sha256_hash, hash);
  });

  it("the database refuses to rewrite the recorded digest, storage path or uploader", async () => {
    const u = await registerAndLogin();
    const { id } = await upload(u.token);
    await assert.rejects(pool.query("UPDATE evidence SET sha256_hash=$1 WHERE id=$2", ["0".repeat(64), id]), /immutable/);
    await assert.rejects(pool.query("UPDATE evidence SET file_path='other' WHERE id=$1", [id]), /immutable/);
    await assert.rejects(pool.query("UPDATE evidence SET uploaded_by=uploaded_by+1 WHERE id=$1", [id]), /immutable/);
    await pool.query("UPDATE evidence SET status='under_review' WHERE id=$1", [id]); // other fields stay editable
  });

  it("a mismatch is also recorded as its own security event, with actor and evidence, and no file contents", async () => {
    const u = await registerAndLogin();
    const { id, file } = await upload(u.token, "secret file contents");
    fs.appendFileSync(file, "x");
    await api("POST", `/api/evidence/${id}/verify`, { token: u.token });
    const rows = (await pool.query("SELECT user_id::text AS uid, details FROM audit_logs WHERE entity_id=$1 AND action='evidence.integrity_mismatch'", [id])).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].uid, u.id);
    assert.equal(rows[0].details.result, "mismatch");
    assert.ok(!JSON.stringify(rows[0].details).includes("secret file contents"));
    assert.equal((await verifyAudits(id)).length, 1, "the regular verify entry is still recorded once");
  });

  it("detail returns the latest verification: recorded and computed digests, outcome, time and actor", async () => {
    const u = await registerAndLogin();
    const { id, file, hash } = await upload(u.token, "latest verification");
    assert.equal((await api("GET", `/api/evidence/${id}`, { token: u.token })).data.latest_verification, null);
    await api("POST", `/api/evidence/${id}/verify`, { token: u.token });
    fs.appendFileSync(file, "x");
    await api("POST", `/api/evidence/${id}/verify`, { token: u.token });
    const lv = (await api("GET", `/api/evidence/${id}`, { token: u.token })).data.latest_verification;
    assert.equal(lv.result, "mismatch");
    assert.equal(lv.recorded_sha256, hash);
    assert.match(lv.computed_sha256, /^[0-9a-f]{64}$/);
    assert.notEqual(lv.computed_sha256, hash);
    assert.ok(lv.verified_at);
    assert.equal(lv.verified_by, "Test User");
  });

  it("filters separate mismatch from unavailable", async () => {
    const u = await registerAndLogin();
    const a = await upload(u.token, "aaa1"); const b = await upload(u.token, "bbb2");
    fs.appendFileSync(a.file, "x"); fs.unlinkSync(b.file);
    await api("POST", `/api/evidence/${a.id}/verify`, { token: u.token });
    await api("POST", `/api/evidence/${b.id}/verify`, { token: u.token });
    const ids = async (f: string) => (await api("GET", `/api/evidence?integrity=${f}`, { token: u.token })).data.evidence.map((e: { id: string }) => e.id);
    assert.deepEqual(await ids("mismatch"), [a.id]);
    assert.deepEqual(await ids("unavailable"), [b.id]);
  });
});