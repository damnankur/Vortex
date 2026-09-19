import { Server, Socket } from "socket.io";
import { z } from "zod";
import { env, isKnownChannel } from "../../env";
import { produceMessage } from "../kafka";
import { logger } from "../../lib/logger";
import { messagesSent } from "../../lib/metrics";
import prisma from "../prisma";
import { cache } from "../cache";
import type { ChatMessage } from "../../types";
import { PresenceManager } from "./presence";

const messageSchema = z.object({
  messageId: z.string().uuid(),
  text: z.string().trim().min(1).max(env.MESSAGE_MAX_LENGTH),
});

const joinSchema = z.object({
  slug: z.string().trim().min(1).max(50),
});

export class ChatHandler {
  private rateBuckets = new Map<string, { count: number; resetAt: number }>();
  private typingSentAt = new Map<string, number>();

  public isRateLimited(socketId: string): boolean {
    const now = Date.now();
    const bucket = this.rateBuckets.get(socketId);
    if (!bucket || now > bucket.resetAt) {
      this.rateBuckets.set(socketId, { count: 1, resetAt: now + env.RATE_LIMIT_WINDOW_MS });
      return false;
    }
    bucket.count += 1;
    return bucket.count > env.RATE_LIMIT_MAX;
  }

  public clearRateBucket(socketId: string) {
    this.rateBuckets.delete(socketId);
  }

  public registerEvents(
    io: Server,
    socket: Socket,
    user: { userId: string; username: string },
    presence: PresenceManager
  ) {
    socket.on("channel:join", async (payload: unknown) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) return;
      const slug = parsed.data.slug;

      try {
        const room = await prisma.room.findUnique({
          where: { slug },
          include: { memberships: { where: { userId: user.userId } } },
        });

        if (!room) {
          if (!isKnownChannel(slug)) return;
        } else if (room.isPrivate && room.memberships.length === 0) {
          socket.emit("error", "Access denied: channel is private");
          return;
        }

        const previous = (socket.data.roomId as string) || env.DEFAULT_ROOM_SLUG;
        if (slug === previous) return;

        socket.leave(previous);
        socket.join(slug);
        socket.data.roomId = slug;
        presence.broadcastPresence(io, previous);
        presence.broadcastPresence(io, slug);
      } catch (err) {
        logger.error({ err, slug }, "failed to join channel");
      }
    });

    socket.on("event: message", async (payload: unknown) => {
      const parsed = messageSchema.safeParse(payload);
      if (!parsed.success) return;

      if (this.isRateLimited(socket.id)) {
        socket.emit("error", "Rate limit exceeded");
        return;
      }

      const roomId = (socket.data.roomId as string) || env.DEFAULT_ROOM_SLUG;
      const message: ChatMessage = {
        messageId: parsed.data.messageId,
        roomId,
        userId: user.userId,
        username: user.username,
        text: parsed.data.text,
        createdAt: new Date().toISOString(),
      };
      const envelope = JSON.stringify(message);

      const ok = await produceMessage(message.messageId, envelope);
      if (!ok) {
        socket.emit("error", "Failed to send message");
        return;
      }

      messagesSent.inc();
      io.to(roomId).emit("message", envelope);
      cache.invalidateChannel(roomId).catch(() => undefined);
    });

    socket.on("typing:start", () => {
      const roomId = (socket.data.roomId as string) || env.DEFAULT_ROOM_SLUG;
      const key = `${roomId}:${user.userId}`;
      const now = Date.now();
      const last = this.typingSentAt.get(key) ?? 0;
      if (now - last < env.TYPING_THROTTLE_MS) return;
      this.typingSentAt.set(key, now);
      io.to(roomId).emit("typing", {
        userId: user.userId,
        username: user.username,
        roomId,
        typing: true,
      });
    });

    socket.on("typing:stop", () => {
      const roomId = (socket.data.roomId as string) || env.DEFAULT_ROOM_SLUG;
      io.to(roomId).emit("typing", {
        userId: user.userId,
        username: user.username,
        roomId,
        typing: false,
      });
    });
  }
}
