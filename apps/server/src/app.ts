import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import http from "http";
import { env } from "./env";
import prisma from "./services/prisma";
import { signToken, verifyToken, AuthUser } from "./lib/auth";
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

  app.get("/messages", authRequired, async (req, res) => {
    const roomId =
      typeof req.query.roomId === "string" ? req.query.roomId : env.DEFAULT_ROOM_SLUG;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const beforeRaw = typeof req.query.before === "string" ? req.query.before : undefined;
    const before = beforeRaw ? new Date(beforeRaw) : undefined;
    const hasValidBefore = before && !Number.isNaN(before.getTime());

    try {
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

  const httpServer = http.createServer(app);
  const socketService = new SocketService();
  socketService.io.attach(httpServer);
  socketService.socketListeners();

  return { app, httpServer, socketService };
}
