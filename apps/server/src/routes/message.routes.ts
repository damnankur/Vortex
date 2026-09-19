import { Router } from "express";
import { env } from "../env";
import prisma from "../services/prisma";
import cache from "../services/cache";
import { logger } from "../lib/logger";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";

export const messageRouter = Router();

// ---------- Messages List (with Redis & LRU Cache) ----------
messageRouter.get("/", authRequired, async (req, res) => {
  const user = (req as AuthRequest).user;
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

    // Cache latest messages for this channel
    if (!hasValidBefore) {
      cache.set(cacheKey, result, 90).catch(() => undefined);
    }

    res.json({ messages: result });
  } catch (err) {
    logger.error({ err }, "fetch messages failed");
    res.status(500).json({ error: "failed to load messages" });
  }
});
