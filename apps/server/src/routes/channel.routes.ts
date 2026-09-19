import { Router } from "express";
import prisma from "../services/prisma";
import { logger } from "../lib/logger";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";
import type { SocketService } from "../services/socket";

export const channelRouter = Router();

// ---------- Channels List ----------
channelRouter.get("/", authRequired, async (req, res) => {
  const user = (req as AuthRequest).user;
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
channelRouter.post("/", authRequired, async (req, res) => {
  const user = (req as AuthRequest).user;
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
    const socketService = req.app.get("socketService") as SocketService | undefined;
    if (socketService?.io) {
      socketService.io.emit("channel:created", {
        slug: room.slug,
        name: room.name,
        type: room.type,
        isPrivate: room.isPrivate,
        serverSlug: targetServerSlug,
      });
    }

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
channelRouter.post("/:slug/join", authRequired, async (req, res) => {
  const user = (req as AuthRequest).user;
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
