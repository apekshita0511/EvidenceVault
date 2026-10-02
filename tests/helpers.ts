import "./env-setup.js";
import type { Server } from "node:http";
import { after, before } from "node:test";
import { pool } from "../src/config/database.js";

const { app } = await import("../src/app.js");

export { pool };
export let base = "";
let server: Server;

export function setupServer() {
  before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  after(async () => {
    server.close();
    await pool.end();
  });
}

let counter = 0;
export const uniqueEmail = () => `user${Date.now()}${counter++}@example.test`;

export async function api(method: string, url: string, opts: { token?: string; json?: unknown; form?: FormData } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) body = opts.form;
  const res = await fetch(base + url, { method, headers, body });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

export async function registerAndLogin() {
  const email = uniqueEmail();
  const password = "correct-horse-battery";
  const reg = await api("POST", "/api/auth/register", { json: { name: "Test User", email, password } });
  const login = await api("POST", "/api/auth/login", { json: { email, password } });
  return { email, password, id: reg.data.user.id as string, token: login.data.token as string };
}

export function uploadForm(content: string | Buffer, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.set("title", fields.title ?? "Disk image");
  form.set("evidence_type", fields.evidence_type ?? "disk_image");
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  form.set("file", new Blob([content]), "../../evil name.bin");
  return form;
}
