import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { api, setupServer, pool, registerAndLogin, uniqueEmail } from "./helpers.js";

setupServer();

describe("health", () => {
  it("GET /health", async () => {
    const r = await api("GET", "/health");
    assert.equal(r.status, 200);
    assert.equal(r.data.success, true);
  });
  it("GET /db-health reaches the test database", async () => {
    const r = await api("GET", "/db-health");
    assert.equal(r.status, 200);
    assert.equal(r.data.database, "evidencevault_test");
  });
});

describe("registration", () => {
  it("rejects invalid input", async () => {
    for (const json of [
      {}, { name: "A", email: "nope", password: "longenough" },
      { name: "A", email: "a@b.test", password: "short" },
      { name: "A", email: "a@b.test", password: "x".repeat(73) },
      { name: 5, email: "a@b.test", password: "longenough" },
    ]) {
      const r = await api("POST", "/api/auth/register", { json });
      assert.equal(r.status, 400, JSON.stringify(json));
    }
  });
  it("registers, normalizes email, never returns hash, ignores role in body", async () => {
    const email = uniqueEmail();
    const r = await api("POST", "/api/auth/register", {
      json: { name: " Ada ", email: ` ${email.toUpperCase()} `, password: "correct-horse-battery", role: "admin" },
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.user.email, email);
    assert.equal(r.data.user.role, "investigator");
    assert.equal(r.data.user.password_hash, undefined);
    const row = await pool.query("SELECT password_hash FROM users WHERE email=$1", [email]);
    assert.match(row.rows[0].password_hash, /^\$2[aby]\$/);
  });
  it("rejects duplicate email, including concurrent requests", async () => {
    const email = uniqueEmail();
    const json = { name: "Dup", email, password: "correct-horse-battery" };
    const results = await Promise.all([1, 2, 3].map(() => api("POST", "/api/auth/register", { json })));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
  });
});

describe("login and JWT", () => {
  it("logs in with correct credentials", async () => {
    const u = await registerAndLogin();
    assert.ok(u.token);
  });
  it("returns the same generic error for wrong password and unknown email", async () => {
    const u = await registerAndLogin();
    const a = await api("POST", "/api/auth/login", { json: { email: u.email, password: "wrong-password" } });
    const b = await api("POST", "/api/auth/login", { json: { email: uniqueEmail(), password: "wrong-password" } });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.deepEqual(a.data, b.data);
  });
  it("GET /me returns the user for a valid token", async () => {
    const u = await registerAndLogin();
    const r = await api("GET", "/api/auth/me", { token: u.token });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.email, u.email);
    assert.equal(r.data.user.password_hash, undefined);
  });
  it("rejects missing, malformed, wrongly signed and expired tokens", async () => {
    const u = await registerAndLogin();
    const secret = process.env.JWT_SECRET!;
    const expired = jwt.sign({ userId: u.id }, secret, { expiresIn: -10 });
    const forged = jwt.sign({ userId: u.id }, "some-other-secret-value-123");
    const none = jwt.sign({ userId: u.id }, "", { algorithm: "none" } as jwt.SignOptions);
    assert.equal((await api("GET", "/api/auth/me")).status, 401);
    for (const token of ["garbage", expired, forged, none]) {
      assert.equal((await api("GET", "/api/auth/me", { token })).status, 401);
    }
    assert.equal((await api("GET", "/api/evidence")).status, 401);
  });
});
