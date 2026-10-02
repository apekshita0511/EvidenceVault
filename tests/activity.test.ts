import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { api, setupServer, pool, registerAndLogin, uploadForm } from "./helpers.js";

setupServer();

const up = (token: string, content: string, fields: Record<string, string> = {}) =>
  api("POST", "/api/evidence", { token, form: uploadForm(content, fields) });

describe("evidence list, filters and stats", () => {
  it("requires auth", async () => {
    for (const p of ["/api/evidence/stats", "/api/evidence/options", "/api/audit", "/api/custody"]) {
      assert.equal((await api("GET", p)).status, 401, p);
    }
  });

  it("reports integrity status, uploader name, and supports search/filter/pagination", async () => {
    const u = await registerAndLogin();
    const a = (await up(u.token, "aaa", { title: "Alpha laptop", evidence_type: "disk_image" })).data.evidence;
    const b = (await up(u.token, "bbb", { title: "Beta phone", evidence_type: "mobile" })).data.evidence;
    assert.equal(a.integrity, null);
    assert.equal(a.uploaded_by_name, "Test User");

    assert.equal((await api("POST", `/api/evidence/${a.id}/verify`, { token: u.token })).data.result, "match");
    fs.appendFileSync(path.join(process.env.EVIDENCE_DIR!, (await pool.query("SELECT file_path FROM evidence WHERE id=$1", [b.id])).rows[0].file_path), "x");
    assert.equal((await api("POST", `/api/evidence/${b.id}/verify`, { token: u.token })).data.result, "mismatch");

    const list = (q: string) => api("GET", `/api/evidence${q}`, { token: u.token });
    assert.equal((await list("")).data.total, 2);
    assert.deepEqual((await list("?integrity=verified")).data.evidence.map((e: { id: string }) => e.id), [a.id]);
    assert.deepEqual((await list("?integrity=failed")).data.evidence.map((e: { id: string }) => e.id), [b.id]);
    assert.equal((await list("?integrity=unverified")).data.total, 0);
    assert.deepEqual((await list("?q=phone")).data.evidence.map((e: { id: string }) => e.id), [b.id]);
    assert.equal((await list("?q=%25")).data.total, 0, "wildcards in search are escaped");
    assert.deepEqual((await list("?type=disk_image")).data.evidence.map((e: { id: string }) => e.id), [a.id]);
    const page = await list("?page_size=1&page=2&sort=title&dir=asc");
    assert.equal(page.data.evidence.length, 1);
    assert.equal(page.data.evidence[0].id, b.id);
    assert.equal(page.data.total, 2);
    assert.equal((await list("?integrity=bogus")).status, 400);
    assert.equal((await list("?sort=password_hash")).status, 400);

    assert.deepEqual((await api("GET", "/api/evidence/stats", { token: u.token })).data.stats,
      { total: 2, verified: 1, failed: 1, unverified: 0, recent_uploads: 2 });
    assert.deepEqual((await api("GET", "/api/evidence/options", { token: u.token })).data.types, ["disk_image", "mobile"]);
  });

  it("scopes stats and lists to the caller", async () => {
    const owner = await registerAndLogin();
    const other = await registerAndLogin();
    await up(owner.token, "zzz");
    assert.deepEqual((await api("GET", "/api/evidence/stats", { token: other.token })).data.stats,
      { total: 0, verified: 0, failed: 0, unverified: 0, recent_uploads: 0 });
  });
});

describe("audit and custody feeds", () => {
  it("returns only the caller's audit entries and custody events", async () => {
    const owner = await registerAndLogin();
    const other = await registerAndLogin();
    const ev = (await up(owner.token, "feed")).data.evidence;
    await api("POST", `/api/evidence/${ev.id}/verify`, { token: owner.token });

    const custody = await api("GET", "/api/custody", { token: owner.token });
    assert.deepEqual(custody.data.events.map((e: { action: string }) => e.action), ["integrity_match", "registered"]);
    assert.equal(custody.data.events[0].actor_name, "Test User");
    assert.equal(custody.data.events[0].evidence_title, "Disk image");
    assert.equal(custody.data.total, 2);
    assert.equal((await api("GET", "/api/custody", { token: other.token })).data.total, 0);

    const only = (q: string) => api("GET", `/api/custody${q}`, { token: owner.token });
    assert.deepEqual((await only("?action=integrity")).data.events.map((e: { action: string }) => e.action), ["integrity_match"]);
    assert.deepEqual((await only("?action=registered")).data.events.map((e: { action: string }) => e.action), ["registered"]);
    assert.equal((await only(`?evidence_id=${ev.id}`)).data.total, 2);
    assert.equal((await only("?evidence_id=999999")).data.total, 0);
    assert.equal((await only("?action=drop_table")).status, 400);
    assert.equal((await only("?evidence_id=abc")).status, 400);
    assert.equal((await api("GET", `/api/custody?evidence_id=${ev.id}`, { token: other.token })).data.total, 0, "filters never widen access");

    const audit = await api("GET", "/api/audit?limit=2", { token: owner.token });
    assert.equal(audit.data.entries.length, 2);
    assert.equal(audit.data.entries[0].action, "evidence.verify");
    assert.ok(audit.data.entries.every((e: { user_id: string }) => e.user_id === owner.id));
    assert.ok(audit.data.total >= 4);
    assert.ok(!JSON.stringify(audit.data).includes("password"));
    const byEvidence = await api("GET", `/api/audit?evidence_id=${ev.id}`, { token: owner.token });
    assert.deepEqual(byEvidence.data.entries.map((e: { action: string }) => e.action), ["evidence.verify", "evidence.register"]);
    assert.equal((await api("GET", "/api/audit?evidence_id=abc", { token: owner.token })).status, 400);
  });

  it("lets admins see everyone's activity", async () => {
    const admin = await registerAndLogin();
    const user = await registerAndLogin();
    await up(user.token, "seen by admin");
    await pool.query("UPDATE users SET role='admin' WHERE id=$1", [admin.id]);
    assert.ok((await api("GET", "/api/custody", { token: admin.token })).data.events.some((e: { actor_id: string }) => e.actor_id === user.id));
    assert.ok((await api("GET", "/api/evidence", { token: admin.token })).data.total >= 1);
  });
});