import { Express } from "express";
import { healthRouter } from "./health.routes";
import { authRouter } from "./auth.routes";
import { serverRouter } from "./server.routes";
import { serverMemberRouter } from "./server-member.routes";
import { channelRouter } from "./channel.routes";
import { messageRouter } from "./message.routes";

export function registerRoutes(app: Express): void {
  app.use(healthRouter);
  app.use("/auth", authRouter);
  app.use("/servers", serverRouter);
  app.use("/servers", serverMemberRouter);
  app.use("/channels", channelRouter);
  app.use("/messages", messageRouter);
}
