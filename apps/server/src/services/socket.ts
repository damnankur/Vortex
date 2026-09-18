import { Server, Socket } from "socket.io";
import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { z } from "zod";
import { env } from "../env";
import { verifyToken } from "../lib/auth";
import { produceMessage } from "./kafka";
import { logger } from "../lib/logger";
import { messagesSent, socketConnections } from "../lib/metrics";
import type { ChatMessage } from "../types";

const publisher = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  username: env.REDIS_USER,
  password: env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => Math.min(times * 200, 5000),
  maxRetriesPerRequest: 3,
  connectTimeout: 5000,
  lazyConnect: true,
});

const subscriber = publisher.duplicate();

const messageSchema = z.object({
  messageId: z.string().uuid(),
  text: z.string().trim().min(1).max(env.MESSAGE_MAX_LENGTH),
});

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(socketId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(socketId);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(socketId, { count: 1, resetAt: now + env.RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > env.RATE_LIMIT_MAX;
}

export class SocketService {
  private _io: Server;

  constructor() {
    this._io = new Server({
      cors: {
        origin: env.CORS_ORIGINS.split(",").map((s) => s.trim()),
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket"],
      maxHttpBufferSize: 16 * 1024,
    });

    this._io.adapter(createAdapter(publisher, subscriber));

    this._io.use((socket, next) => {
      if (this._io.engine.clientsCount >= env.MAX_CONNECTIONS) {
        return next(new Error("server at capacity"));
      }
      const token = socket.handshake.auth?.token as string | undefined;
      const user = verifyToken(token);
      if (!user) {
        return next(new Error("unauthorized"));
      }
      socket.data.user = user;
      next();
    });
  }

  public socketListeners() {
    const io = this._io;

    io.on("connection", (socket: Socket) => {
      const user = socket.data.user as { userId: string; username: string };

      socketConnections.inc();
      socket.join(env.DEFAULT_ROOM_SLUG);

      socket.on("event: message", async (payload: unknown) => {
        const parsed = messageSchema.safeParse(payload);
        if (!parsed.success) return;

        if (isRateLimited(socket.id)) {
          socket.emit("error", "Rate limit exceeded");
          return;
        }

        const message: ChatMessage = {
          messageId: parsed.data.messageId,
          roomId: env.DEFAULT_ROOM_SLUG,
          userId: user.userId,
          username: user.username,
          text: parsed.data.text,
          createdAt: new Date().toISOString(),
        };
        const envelope = JSON.stringify(message);

        // Persist first (source of truth); only broadcast once it's queued.
        const ok = await produceMessage(message.messageId, envelope);
        if (!ok) {
          socket.emit("error", "Failed to send message");
          return;
        }

        messagesSent.inc();
        io.to(env.DEFAULT_ROOM_SLUG).emit("message", envelope);
      });

      socket.on("disconnect", () => {
        socketConnections.dec();
        rateBuckets.delete(socket.id);
      });
    });
  }

  public async close() {
    logger.info("closing socket service");
    await this._io.close();
    await publisher.quit().catch(() => undefined);
    await subscriber.quit().catch(() => undefined);
  }

  get io() {
    return this._io;
  }
}
