import crypto from "crypto";
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

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    if (!salt || !key) return resolve(false);
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      try {
        const keyBuffer = Buffer.from(key, "hex");
        resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
      } catch {
        resolve(false);
      }
    });
  });
}
