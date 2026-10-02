import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";
import { getJwtSecret } from "../config/env.js";
import { recordAudit } from "../services/audit.service.js";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "investigator" | "examiner";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const unauthorized = (res: Response) =>
  res.status(401).json({ success: false, message: "Authentication required" });

// Verifies the Bearer token, then loads the user from the database so
// the role is always current and never taken from the request body.
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return unauthorized(res);

  let userId: string;
  try {
    const payload = jwt.verify(header.slice(7), getJwtSecret(), { algorithms: ["HS256"] });
    if (typeof payload === "string" || typeof payload.userId !== "string") return unauthorized(res);
    userId = payload.userId;
  } catch {
    return unauthorized(res);
  }

  const result = await pool.query(
    "SELECT id::text AS id, name, email, role FROM users WHERE id = $1",
    [userId]
  );
  if (result.rowCount === 0) return unauthorized(res);

  req.user = result.rows[0] as AuthUser;
  next();
}

export function requireRole(...roles: AuthUser["role"][]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      await recordAudit({
        userId: req.user?.id ?? null,
        action: "access.denied",
        entityType: "route",
        details: { path: req.path, method: req.method },
      });
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    next();
  };
}
