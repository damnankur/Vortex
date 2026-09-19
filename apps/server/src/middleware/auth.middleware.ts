import { Request, Response, NextFunction } from "express";
import { verifyToken, AuthUser } from "../lib/auth";

export interface AuthRequest extends Request {
  user: AuthUser;
}

export function authRequired(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  (req as AuthRequest).user = user;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  const user = verifyToken(token);
  if (user) {
    (req as AuthRequest).user = user;
  }
  next();
}
