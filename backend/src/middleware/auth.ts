import type { NextFunction, Request, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";

export type AuthPayload = { sub: string; role: Role };

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET;

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!JWT_SECRET) {
    res.status(500).json({ error: "JWT_SECRET is not configured" });
    return;
  }
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function signToken(payload: AuthPayload, expiresIn: SignOptions["expiresIn"] = "7d") {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  const options: SignOptions = { expiresIn };
  return jwt.sign({ sub: payload.sub, role: payload.role }, JWT_SECRET, options);
}
