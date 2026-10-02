import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";
import { config, getJwtSecret } from "../config/env.js";
import { recordAudit } from "../services/audit.service.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A real hash of a throwaway value, so unknown-email logins cost the same as wrong-password ones.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

const normalizeEmail = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

export const register = async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = normalizeEmail(body.email);
  const password = body.password;

  if (!name || name.length > 100) {
    return res.status(400).json({ success: false, message: "Name is required (max 100 characters)" });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ success: false, message: "A valid email is required" });
  }
  // bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than truncated.
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ success: false, message: "Password must be 8-72 bytes" });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    // Role is never accepted from the client: new accounts are always investigators.
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'investigator')
       RETURNING id::text AS id, name, email, role, created_at`,
      [name, email, passwordHash]
    );
    const user = result.rows[0];
    await recordAudit({ userId: user.id, action: "auth.register", entityType: "user", entityId: user.id });
    return res.status(201).json({ success: true, message: "User registered successfully", user });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return res.status(409).json({ success: false, message: "Email is already registered" });
    }
    throw error;
  }
};

export const login = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || typeof password !== "string" || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  const result = await pool.query(
    "SELECT id::text AS id, name, email, password_hash, role FROM users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

  if (!user || !valid) {
    await recordAudit({
      userId: user?.id ?? null,
      action: "auth.login_failed",
      entityType: "user",
      entityId: user?.id ?? null,
    });
    return res.status(401).json({ success: false, message: "Invalid email or password" });
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });

  await recordAudit({ userId: user.id, action: "auth.login", entityType: "user", entityId: user.id });
  return res.status(200).json({
    success: true,
    message: "Login successful",
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
};

export const me = (req: Request, res: Response) => {
  res.status(200).json({ success: true, user: req.user });
};
