import { Router } from "express";
import prisma from "../services/prisma";
import { logger } from "../lib/logger";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";

export const serverRouter = Router();

// ---------- List User's Servers ----------
serverRouter.get("/", authRequired, async (req, res) => {
  const user = (req as AuthRequest).user;
  try {
    // If user has zero servers, auto-enroll them into the default community server
    const existingCount = await prisma.serverMembership.count({
      where: { userId: user.userId },
    });

    if (existingCount === 0) {
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

// ---------- Create Server ----------
serverRouter.post("/", authRequired, async (req, res) => {
  const user = (req as AuthRequest).user;
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

// ---------- Join Server via Invite Code ----------
serverRouter.post("/join", authRequired, async (req, res) => {
  const user = (req as AuthRequest).user;
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

