import { Server, Socket } from "socket.io";
import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { env } from "../../env";
import { verifyToken } from "../../lib/auth";
import { logger } from "../../lib/logger";
import { socketConnections } from "../../lib/metrics";
import { PresenceManager } from "./presence";
import { VoiceHandler } from "./voice.handler";
import { ChatHandler } from "./chat.handler";

export { VoiceUser } from "./voice.handler";

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

export class SocketService {
  private _io: Server;
  private presence = new PresenceManager();
  private voice = new VoiceHandler();
  private chat = new ChatHandler();

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
      socket.data.roomId = env.DEFAULT_ROOM_SLUG;
      this.presence.addPresence(user);
      this.presence.broadcastPresence(io, env.DEFAULT_ROOM_SLUG);

      // Register chat & voice handlers
      this.chat.registerEvents(io, socket, user, this.presence);

      socket.emit("voice:counts", this.voice.getVoiceCounts());
      socket.emit("voice:state", this.voice.getVoiceState());
      this.voice.registerEvents(io, socket, user);

      socket.on("disconnect", () => {
        socketConnections.dec();
        this.chat.clearRateBucket(socket.id);
        const roomId = (socket.data.roomId as string) || env.DEFAULT_ROOM_SLUG;
        this.presence.removePresence(user.userId);
        this.presence.broadcastPresence(io, roomId);
        this.voice.handleLeaveVoice(io, socket, user);
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

