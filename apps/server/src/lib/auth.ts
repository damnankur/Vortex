import jwt from "jsonwebtoken";
import { env } from "../env";

export interface AuthUser {
  userId: string;
  username: string;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ userId: user.userId, username: user.username }, env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

export function verifyToken(token?: string): AuthUser | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (typeof payload.userId !== "string" || typeof payload.username !== "string") {
      return null;
    }
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}
