import client from "prom-client";
import type { Request, Response } from "express";

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequests = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

export const socketConnections = new client.Gauge({
  name: "socket_connections",
  help: "Current socket.io connections",
  registers: [registry],
});

export const messagesSent = new client.Counter({
  name: "messages_sent_total",
  help: "Total chat messages produced to Kafka",
  registers: [registry],
});

export async function metricsHandler(_req: Request, res: Response) {
  res.set("Content-Type", registry.contentType);
  res.send(await registry.metrics());
}
