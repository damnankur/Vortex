import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import http from "http";
import { env } from "./env";
import prisma from "./services/prisma";
import { signToken, verifyToken, hashPassword, verifyPassword, AuthUser } from "./lib/auth";
import { logger } from "./lib/logger";
import { httpRequests, metricsHandler } from "./lib/metrics";
import { SocketService } from "./services/socket";

const allowedOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim());

function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  (req as Request & { user: AuthUser }).user = user;
  next();
}

export async function createApp() {
  const app = express();
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "16kb" }));

  const httpServer = http.createServer(app);
  const socketService = new SocketService();
  socketService.io.attach(httpServer);
  socketService.socketListeners();

  app.use((req, res, next) => {
    res.on("finish", () => {
      httpRequests.inc({
        method: req.method,
        route: req.path,
        status: String(res.statusCode),
      });
    });
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.get("/metrics", metricsHandler);

  // ---------- User Registration ----------
  app.post("/auth/register", async (req, res) => {
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
  app.post("/auth/login", async (req, res) => {
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
  app.get("/auth/me", authRequired, async (req, res) => {
    const user = (req as Request & { user: AuthUser }).user;
    res.json({ user: { id: user.userId, username: user.username } });
  });

  // Backward-compatible guest join
  app.post("/auth/join", async (req, res) => {
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
      const token = signToken({ userId: user.id, username: user.username });
      res.json({ token, user: { id: user.id, username: user.username } });
    } catch (err) {
      logger.error({ err }, "join failed");
      res.status(500).json({ error: "join failed" });
    }
  });

  // ---------- Channels List ----------
  app.get("/channels", authRequired, async (req, res) => {
    const user = (req as Request & { user: AuthUser }).user;
    try {
      const rooms = await prisma.room.findMany({
        where: { type: "CHANNEL" },
        orderBy: { createdAt: "asc" },
        include: {
          memberships: {
            where: { userId: user.userId },
            select: { id: true },
          },
        },
      });

      const channels = rooms.map((r) => ({
        slug: r.slug,
        name: r.name,
        type: r.type,
        isPrivate: r.isPrivate,
        isMember: !r.isPrivate || r.memberships.length > 0,
      }));

      res.json({ channels });
    } catch (err) {
      logger.error({ err }, "fetch channels failed");
      res.status(500).json({ error: "failed to load channels" });
    }
  });

  // ---------- Create Dynamic Channel ----------
  app.post("/channels", authRequired, async (req, res) => {
    const user = (req as Request & { user: AuthUser }).user;
    const { name, slug: customSlug, isPrivate, inviteCode } = req.body as {
      name?: unknown;
      slug?: unknown;
      isPrivate?: unknown;
      inviteCode?: unknown;
    };

    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName || cleanName.length > 50) {
      res.status(400).json({ error: "Channel name must be 1-50 characters" });
      return;
    }

    let slug = typeof customSlug === "string" ? customSlug.trim().toLowerCase() : "";
    if (!slug) {
      slug = cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    if (!slug || slug.length > 50) {
      res.status(400).json({ error: "Invalid channel slug" });
      return;
    }

    const cleanIsPrivate = Boolean(isPrivate);
    const cleanInviteCode = typeof inviteCode === "string" ? inviteCode.trim() : null;

    try {
      const existing = await prisma.room.findUnique({
        where: { slug },
      });

      if (existing) {
        res.status(409).json({ error: "A channel with this identifier already exists" });
        return;
      }

      const room = await prisma.room.create({
        data: {
          name: cleanName,
          slug,
          type: "CHANNEL",
          isPrivate: cleanIsPrivate,
          inviteCode: cleanIsPrivate ? cleanInviteCode : null,
          createdById: user.userId,
          memberships: {
            create: {
              userId: user.userId,
            },
          },
        },
      });

      // Broadcast new channel to all connected sockets
      socketService.io.emit("channel:created", {
        slug: room.slug,
        name: room.name,
        type: room.type,
        isPrivate: room.isPrivate,
      });

      res.status(201).json({
        channel: {
          slug: room.slug,
          name: room.name,
          type: room.type,
          isPrivate: room.isPrivate,
          isMember: true,
        },
      });
    } catch (err) {
      logger.error({ err }, "create channel failed");
      res.status(500).json({ error: "Failed to create channel" });
    }
  });

  // ---------- Join Private / Code-Gated Channel ----------
  app.post("/channels/:slug/join", authRequired, async (req, res) => {
    const user = (req as Request & { user: AuthUser }).user;
    const { slug } = req.params;
    const { inviteCode } = req.body as { inviteCode?: unknown };

    try {
      const room = await prisma.room.findUnique({
        where: { slug },
        include: {
          memberships: {
            where: { userId: user.userId },
          },
        },
      });

      if (!room) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }

      if (room.memberships.length > 0) {
        res.json({ success: true, message: "Already a member", slug: room.slug });
        return;
      }

      if (room.isPrivate) {
        const suppliedCode = typeof inviteCode === "string" ? inviteCode.trim() : "";
        if (room.inviteCode && room.inviteCode !== suppliedCode) {
          res.status(403).json({ error: "Invalid channel passkey" });
          return;
        }
      }

      await prisma.roomMembership.upsert({
        where: {
          userId_roomId: {
            userId: user.userId,
            roomId: room.id,
          },
        },
        create: {
          userId: user.userId,
          roomId: room.id,
        },
        update: {},
      });

      res.json({ success: true, slug: room.slug });
    } catch (err) {
      logger.error({ err, slug }, "join channel failed");
      res.status(500).json({ error: "Failed to join channel" });
    }
  });

  // ---------- Messages List ----------
  app.get("/messages", authRequired, async (req, res) => {
    const user = (req as Request & { user: AuthUser }).user;
    const roomId =
      typeof req.query.roomId === "string" ? req.query.roomId : env.DEFAULT_ROOM_SLUG;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const beforeRaw = typeof req.query.before === "string" ? req.query.before : undefined;
    const before = beforeRaw ? new Date(beforeRaw) : undefined;
    const hasValidBefore = before && !Number.isNaN(before.getTime());

    try {
      // If room is private, verify user is a member
      const room = await prisma.room.findUnique({
        where: { slug: roomId },
        include: {
          memberships: {
            where: { userId: user.userId },
          },
        },
      });

      if (room && room.isPrivate && room.memberships.length === 0) {
        res.status(403).json({ error: "Access denied: channel is private" });
        return;
      }

      const messages = await prisma.message.findMany({
        where: {
          roomId,
          deletedAt: null,
          ...(hasValidBefore ? { createdAt: { lt: before! } } : {}),
        },
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      const result = messages.reverse().map((m) => ({
        messageId: m.messageId,
        roomId: m.roomId,
        userId: m.userId,
        username: m.user?.username ?? null,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
      }));

      res.json({ messages: result });
    } catch (err) {
      logger.error({ err }, "fetch messages failed");
      res.status(500).json({ error: "failed to load messages" });
    }
  });

  return { app, httpServer, socketService };
}
