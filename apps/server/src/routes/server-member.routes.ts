import { Router } from "express";
import prisma from "../services/prisma";
import { logger } from "../lib/logger";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";

export const serverMemberRouter = Router({ mergeParams: true });

// ---------- Server Members List ----------
serverMemberRouter.get("/:serverSlug/members", authRequired, async (req, res) => {
  const { serverSlug } = req.params;
  const user = (req as AuthRequest).user;

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

    // If vortex-main, ensure demo bot personas are included
    if (server.slug === "vortex-main") {
      const bots = await prisma.user.findMany({
        where: {
          username: {
            in: ["AnalogKid", "DracoRex", "LunaWave", "NovaWolfe", "OrionPrime", "PixelParker"],
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
serverMemberRouter.post("/:serverSlug/leave", authRequired, async (req, res) => {
  const { serverSlug } = req.params;
  const user = (req as AuthRequest).user;

  const userMembershipCount = await prisma.serverMembership.count({
    where: { userId: user.userId },
  });

  if (userMembershipCount <= 1) {
    res.status(400).json({
      error: "Cannot leave your only active server. Join or create another server first.",
    });
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

    // If owner leaves, delete server
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

    if (server.memberships.length === 0) {
      res.status(400).json({ error: "You are not a member of this server" });
      return;
    }

    await prisma.serverMembership.deleteMany({
      where: {
        serverId: server.id,
        userId: user.userId,
      },
    });

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
serverMemberRouter.delete("/:serverSlug", authRequired, async (req, res) => {
  const { serverSlug } = req.params;
  const user = (req as AuthRequest).user;

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
