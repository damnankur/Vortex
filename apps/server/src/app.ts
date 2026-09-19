import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import http from "http";
import { env } from "./env";
import prisma from "./services/prisma";
import { signToken, verifyToken, hashPassword, verifyPassword, AuthUser } from "./lib/auth";
import { logger } from "./lib/logger";
import { httpRequests, metricsHandler } from "./lib/metrics";
import { SocketService } from "./services/socket";
import cache from "./services/cache";

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

  // ---------- Servers Endpoints ----------
  app.get("/servers", authRequired, async (req, res) => {
    const user = (req as Request & { user: AuthUser }).user;
    try {
      // Ensure default server exists and user is a member
      const mainServer = await prisma.server.findUnique({
        where: { slug: "vortex-main" },
      });

      if (mainServer) {
        await prisma.serverMembership.upsert({
          where: {
            serverId_userId: { serverId: mainServer.id, userId: user.userId },
          },
          create: { serverId: mainServer.id, userId: user.userId, role: "MEMBER" },
          update: {},
        });
      }

      // Fetch all servers user belongs to or owns
      const memberships = await prisma.serverMembership.findMany({
        where: { userId: user.userId },
        select: { serverId: true, role: true },
      });
      const serverIds = memberships.map((m) => m.serverId);

      const servers = await prisma.server.findMany({
        where: { id: { in: serverIds } },
        include: {
          _count: { select: { rooms: true, memberships: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      const roleMap = new Map(memberships.map((m) => [m.serverId, m.role]));

      const result = servers.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        iconUrl: s.iconUrl,
        inviteCode: s.inviteCode,
        isOwner: s.ownerId === user.userId,
        role: roleMap.get(s.id) || (s.ownerId === user.userId ? "OWNER" : "MEMBER"),
        memberCount: s._count.memberships,
        channelCount: s._count.rooms,
      }));

      res.json({ servers: result });
    } catch (err) {
      logger.error({ err }, "fetch servers failed");
      res.status(500).json({ error: "Failed to load servers" });
    }
  });

  // Create Server
  app.post("/servers", authRequired, async (req, res) => {
    const user = (req as Request & { user: AuthUser }).user;
    const { name, description } = req.body as {
      name?: unknown;
      description?: unknown;
    };

    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName || cleanName.length > 50) {
      res.status(400).json({ error: "Server name must be 1-50 characters" });
      return;
    }

    const cleanDesc = typeof description === "string" ? description.trim() : "";

    const rawSlug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const serverSlug = `${rawSlug || "server"}-${randomSuffix}`;
    const inviteCode = `VX-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    try {
      const server = await prisma.server.create({
        data: {
          name: cleanName,
          slug: serverSlug,
          description: cleanDesc || null,
          inviteCode,
          ownerId: user.userId,
          memberships: {
            create: {
              userId: user.userId,
              role: "OWNER",
            },
          },
          rooms: {
            create: {
              name: "general",
              slug: `${serverSlug}-general`,
              type: "CHANNEL",
              createdById: user.userId,
            },
          },
        },
        include: {
          rooms: true,
          _count: { select: { rooms: true, memberships: true } },
        },
      });

      res.status(201).json({
        server: {
          id: server.id,
          name: server.name,
          slug: server.slug,
          description: server.description,
          iconUrl: server.iconUrl,
          inviteCode: server.inviteCode,
          isOwner: true,
          role: "OWNER",
          memberCount: server._count.memberships,
          channelCount: server._count.rooms,
          defaultChannelSlug: server.rooms[0]?.slug,
        },
      });
    } catch (err) {
      logger.error({ err }, "create server failed");
      res.status(500).json({ error: "Failed to create server" });
    }
  });

  // Join Server via Invite Code
  app.post("/servers/join", authRequired, async (req, res) => {
    const user = (req as Request & { user: AuthUser }).user;
    const { inviteCode } = req.body as { inviteCode?: unknown };

    const cleanCode = typeof inviteCode === "string" ? inviteCode.trim().toUpperCase() : "";
    if (!cleanCode) {
      res.status(400).json({ error: "Invite code is required" });
      return;
    }

    try {
      const server = await prisma.server.findUnique({
        where: { inviteCode: cleanCode },
        include: {
          rooms: { orderBy: { createdAt: "asc" }, take: 1 },
          _count: { select: { rooms: true, memberships: true } },
        },
      });

      if (!server) {
        res.status(404).json({ error: "No server found matching that invite code" });
        return;
      }

      await prisma.serverMembership.upsert({
        where: {
          serverId_userId: { serverId: server.id, userId: user.userId },
        },
        create: {
          serverId: server.id,
          userId: user.userId,
          role: "MEMBER",
        },
        update: {},
      });

      res.json({
        success: true,
        server: {
          id: server.id,
          name: server.name,
          slug: server.slug,
          description: server.description,
          iconUrl: server.iconUrl,
          inviteCode: server.inviteCode,
          isOwner: server.ownerId === user.userId,
          role: server.ownerId === user.userId ? "OWNER" : "MEMBER",
          memberCount: server._count.memberships + 1,
          channelCount: server._count.rooms,
          defaultChannelSlug: server.rooms[0]?.slug || "general",
        },
      });
    } catch (err) {
      logger.error({ err }, "join server failed");
      res.status(500).json({ error: "Failed to join server" });
    }
  });

  // ---------- Server Members List ----------
  app.get("/servers/:serverSlug/members", authRequired, async (req, res) => {
    const { serverSlug } = req.params;
    const user = (req as Request & { user: AuthUser }).user;

    try {
      const server = await prisma.server.findUnique({
        where: { slug: serverSlug },
        include: {
          owner: { select: { id: true, username: true } },
          memberships: {
            include: {
              user: { select: { id: true, username: true } },
            },
          },
        },
      });

      if (!server) {
        res.status(404).json({ error: "Server not found" });
        return;
      }

      // Check if user is a member or owner of the server (vortex-main is open to all authenticated operators)
      const isMember =
        server.slug === "vortex-main" ||
        server.ownerId === user.userId ||
        server.memberships.some((m) => m.userId === user.userId);

      if (!isMember) {
        res.status(403).json({ error: "Access denied to server members" });
        return;
      }

      const membersMap = new Map<string, { userId: string; username: string; role: string }>();

      // Add owner
      membersMap.set(server.owner.id, {
        userId: server.owner.id,
        username: server.owner.username,
        role: "OWNER",
      });

      // Add members from server_memberships
      for (const m of server.memberships) {
        membersMap.set(m.user.id, {
          userId: m.user.id,
          username: m.user.username,
          role: m.role,
        });
      }

      // If default community server vortex-main, ensure demo bot personas are also included
      if (server.slug === "vortex-main") {
        const bots = await prisma.user.findMany({
          where: {
            username: {
              in: [
                "AnalogKid",
                "DracoRex",
                "LunaWave",
                "NovaWolfe",
                "OrionPrime",
                "PixelParker",
              ],
            },
          },
          select: { id: true, username: true },
        });
        for (const b of bots) {
          if (!membersMap.has(b.id)) {
            membersMap.set(b.id, {
              userId: b.id,
              username: b.username,
              role: "BOT",
            });
          }
        }
      }

      if (server.slug === "vortex-main" && !membersMap.has(user.userId)) {
        membersMap.set(user.userId, {
          userId: user.userId,
          username: user.username,
          role: "MEMBER",
        });
      }

      res.json({ members: Array.from(membersMap.values()) });
    } catch (err) {
      logger.error({ err, serverSlug }, "fetch server members failed");
      res.status(500).json({ error: "Failed to fetch server members" });
    }
  });

  // ---------- Leave / Delete Server ----------
  app.post("/servers/:serverSlug/leave", authRequired, async (req, res) => {
    const { serverSlug } = req.params;
    const user = (req as Request & { user: AuthUser }).user;

    if (serverSlug === "vortex-main") {
      res.status(400).json({ error: "Cannot leave the default community lobby [VORTEX // MAIN]" });
      return;
    }

    try {
      const server = await prisma.server.findUnique({
        where: { slug: serverSlug },
        include: {
          memberships: {
            where: { userId: user.userId },
          },
        },
      });

      if (!server) {
        res.status(404).json({ error: "Server not found" });
        return;
      }

      // If operator is the owner, leaving deletes the server
      if (server.ownerId === user.userId) {
        await prisma.server.delete({
          where: { id: server.id },
        });

        logger.info({ serverSlug, userId: user.userId }, "Server owner left and deleted server");
        res.json({
          success: true,
          action: "DELETED",
          message: "Server deleted successfully",
          serverSlug,
        });
        return;
      }

      // Check if user is an enrolled member
      if (server.memberships.length === 0) {
        res.status(400).json({ error: "You are not a member of this server" });
        return;
      }

      // Delete server membership
      await prisma.serverMembership.deleteMany({
        where: {
          serverId: server.id,
          userId: user.userId,
        },
      });

      // Clean up any private channel memberships within this server for this user
      const serverRooms = await prisma.room.findMany({
        where: { serverId: server.id },
        select: { id: true },
      });
      if (serverRooms.length > 0) {
        await prisma.roomMembership.deleteMany({
          where: {
            userId: user.userId,
            roomId: { in: serverRooms.map((r) => r.id) },
          },
        });
      }

      logger.info({ serverSlug, userId: user.userId }, "User left server successfully");
      res.json({
        success: true,
        action: "LEFT",
        message: "Left server successfully",
        serverSlug,
      });
    } catch (err) {
      logger.error({ err, serverSlug }, "leave server failed");
      res.status(500).json({ error: "Failed to leave server" });
    }
  });

  // ---------- Delete Server (Owner Only) ----------
  app.delete("/servers/:serverSlug", authRequired, async (req, res) => {
    const { serverSlug } = req.params;
    const user = (req as Request & { user: AuthUser }).user;

    if (serverSlug === "vortex-main") {
      res.status(400).json({ error: "Cannot delete the default community server" });
      return;
    }

    try {
      const server = await prisma.server.findUnique({
        where: { slug: serverSlug },
      });

      if (!server) {
        res.status(404).json({ error: "Server not found" });
        return;
      }

      if (server.ownerId !== user.userId) {
        res.status(403).json({ error: "Only the server owner can delete this server" });
        return;
      }

      await prisma.server.delete({
        where: { id: server.id },
      });

      logger.info({ serverSlug, userId: user.userId }, "Server deleted by owner");
      res.json({ success: true, message: "Server deleted successfully", serverSlug });
    } catch (err) {
      logger.error({ err, serverSlug }, "delete server failed");
      res.status(500).json({ error: "Failed to delete server" });
    }
  });

  // ---------- Channels List ----------
  app.get("/channels", authRequired, async (req, res) => {
    const user = (req as Request & { user: AuthUser }).user;
    const serverSlug = typeof req.query.serverSlug === "string" ? req.query.serverSlug : undefined;

    try {
      let serverIdFilter: string | undefined;

      if (serverSlug) {
        const server = await prisma.server.findUnique({
          where: { slug: serverSlug },
        });
        if (server) {
          serverIdFilter = server.id;
        }
      } else {
        // Default to vortex-main server
        const mainServer = await prisma.server.findUnique({
          where: { slug: "vortex-main" },
        });
        if (mainServer) {
          serverIdFilter = mainServer.id;
        }
      }

      const rooms = await prisma.room.findMany({
        where: {
          type: "CHANNEL",
          ...(serverIdFilter ? { serverId: serverIdFilter } : {}),
        },
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
    const { name, slug: customSlug, isPrivate, inviteCode, serverSlug } = req.body as {
      name?: unknown;
      slug?: unknown;
      isPrivate?: unknown;
      inviteCode?: unknown;
      serverSlug?: unknown;
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
      // Find server to attach to
      let targetServerId: string | null = null;
      let targetServerSlug = typeof serverSlug === "string" ? serverSlug.trim() : "";

      if (targetServerSlug) {
        const s = await prisma.server.findUnique({ where: { slug: targetServerSlug } });
        if (s) targetServerId = s.id;
      }

      if (!targetServerId) {
        const main = await prisma.server.findUnique({ where: { slug: "vortex-main" } });
        if (main) {
          targetServerId = main.id;
          targetServerSlug = main.slug;
        }
      }

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
          serverId: targetServerId,
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
        serverSlug: targetServerSlug,
      });

      res.status(201).json({
        channel: {
          slug: room.slug,
          name: room.name,
          type: room.type,
          isPrivate: room.isPrivate,
          isMember: true,
          serverSlug: targetServerSlug,
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

      // Fast-tier Redis / memory cache lookup (when not paginating backwards)
      const cacheKey = `vortex:channel:${roomId}:messages:${limit}`;
      if (!hasValidBefore) {
        const cached = await cache.get<unknown[]>(cacheKey);
        if (cached) {
          res.json({ messages: cached, source: "cache" });
          return;
        }
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

      // Cache the latest messages for this channel
      if (!hasValidBefore) {
        cache.set(cacheKey, result, 90).catch(() => undefined);
      }

      res.json({ messages: result });
    } catch (err) {
      logger.error({ err }, "fetch messages failed");
      res.status(500).json({ error: "failed to load messages" });
    }
  });

  return { app, httpServer, socketService };
}
