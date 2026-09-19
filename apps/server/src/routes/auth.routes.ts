import { Router } from "express";
import { env } from "../env";
import prisma from "../services/prisma";
import { signToken, hashPassword, verifyPassword } from "../lib/auth";
import { logger } from "../lib/logger";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";

export const authRouter = Router();

// ---------- User Registration ----------
authRouter.post("/register", async (req, res) => {
  const { username, password, serverInviteCode } = req.body as {
    username?: unknown;
    password?: unknown;
    serverInviteCode?: unknown;
  };

  const cleanUsername = typeof username === "string" ? username.trim() : "";
  const cleanPassword = typeof password === "string" ? password : "";

  if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 20) {
    res.status(400).json({ error: "Username must be 3-20 characters" });
    return;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
    res.status(400).json({ error: "Username can only contain letters, numbers, hyphens, and underscores" });
    return;
  }

  if (!cleanPassword || cleanPassword.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  // Check server invite code if configured
  if (env.SERVER_INVITE_CODE) {
    const invite = typeof serverInviteCode === "string" ? serverInviteCode.trim() : "";
    if (invite !== env.SERVER_INVITE_CODE) {
      res.status(403).json({ error: "Invalid server invite passkey. Access restricted to friends." });
      return;
    }
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (existing) {
      if (!existing.passwordHash) {
        // Claim legacy guest handle by setting its password
        const passwordHash = await hashPassword(cleanPassword);
        const user = await prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash },
        });
        const token = signToken({ userId: user.id, username: user.username });
        res.status(200).json({ token, user: { id: user.id, username: user.username } });
        return;
      }
      res.status(409).json({ error: "Username already registered. Please switch to [ LOGIN ]." });
      return;
    }

    const passwordHash = await hashPassword(cleanPassword);
    const user = await prisma.user.create({
      data: {
        username: cleanUsername,
        passwordHash,
      },
    });

    const token = signToken({ userId: user.id, username: user.username });
    res.status(201).json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    logger.error({ err }, "registration failed");
    const msg = err instanceof Error ? err.message : "Registration failed";
    res.status(500).json({ error: `Registration failed: ${msg}` });
  }
});

// ---------- User Login ----------
authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body as {
    username?: unknown;
    password?: unknown;
  };

  const cleanUsername = typeof username === "string" ? username.trim() : "";
  const cleanPassword = typeof password === "string" ? password : "";

  if (!cleanUsername || !cleanPassword) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (!user) {
      res.status(401).json({ error: "Username not found. Switch to [ REGISTER ] to create it." });
      return;
    }

    if (!user.passwordHash) {
      res.status(401).json({ error: "Account has no password set. Switch to [ REGISTER ] to claim it." });
      return;
    }

    const isMatch = await verifyPassword(cleanPassword, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: "Incorrect password. Please try again." });
      return;
    }

    const token = signToken({ userId: user.id, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    logger.error({ err }, "login failed");
    const msg = err instanceof Error ? err.message : "Login failed";
    res.status(500).json({ error: `Login failed: ${msg}` });
  }
});

// ---------- Current Authenticated User ----------
authRouter.get("/me", authRequired, async (req, res) => {
  const user = (req as AuthRequest).user;
  res.json({ user: { id: user.userId, username: user.username } });
});

// Backward-compatible guest join
authRouter.post("/join", async (req, res) => {
  const raw = (req.body as { username?: unknown } | undefined)?.username;
  const username = typeof raw === "string" ? raw.trim() : "";
  if (!username || username.length > 20) {
    res.status(400).json({ error: "username must be 1-20 characters" });
    return;
  }

  try {
    const user = await prisma.user.upsert({
      where: { username },
      create: { username },
      update: {},
    });

    // Ensure joining user/persona is added as member to vortex-main
    const mainServer = await prisma.server.findUnique({
      where: { slug: "vortex-main" },
    });
    if (mainServer) {
      await prisma.serverMembership.upsert({
        where: {
          serverId_userId: { serverId: mainServer.id, userId: user.id },
        },
        create: { serverId: mainServer.id, userId: user.id, role: "MEMBER" },
        update: {},
      });
    }

    const token = signToken({ userId: user.id, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    logger.error({ err }, "join failed");
    res.status(500).json({ error: "join failed" });
  }
});
