import express from "express";
import cors from "cors";
import http from "http";
import { env } from "./env";
import { httpRequests } from "./lib/metrics";
import { SocketService } from "./services/socket";
import { registerRoutes } from "./routes";

const allowedOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim());

export async function createApp() {
  const app = express();
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "16kb" }));

  const httpServer = http.createServer(app);
  const socketService = new SocketService();
  socketService.io.attach(httpServer);
  socketService.socketListeners();

  // Expose socketService on app for routes that broadcast events
  app.set("socketService", socketService);

  // Metrics tracking middleware
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

  // Mount modular route groups
  registerRoutes(app);

  return { app, httpServer, socketService };
}
