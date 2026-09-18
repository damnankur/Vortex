import { env } from "./env";
import { createApp } from "./app";
import { startMessageConsumer, disconnectProducer } from "./services/kafka";
import prisma from "./services/prisma";
import { logger } from "./lib/logger";

async function main() {
  await prisma.room.upsert({
    where: { slug: env.DEFAULT_ROOM_SLUG },
    create: { slug: env.DEFAULT_ROOM_SLUG, name: "General" },
    update: {},
  });

  const consumer = await startMessageConsumer();
  const { httpServer, socketService } = await createApp();

  const server = httpServer.listen(env.PORT, () => {
    logger.info(`Vortex server listening on :${env.PORT}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down...`);

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, 15000);
    forceExit.unref();

    try {
      server.close();
      await socketService.close();
      await consumer.disconnect();
      await disconnectProducer();
      await prisma.$disconnect();
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "shutdown error");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "failed to start server");
  process.exit(1);
});
