import { Router } from "express";
import { metricsHandler } from "../lib/metrics";

export const healthRouter = Router();

healthRouter.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

healthRouter.get("/metrics", metricsHandler);
