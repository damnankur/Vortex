import { env, channelSlugs } from "./env";
import { createApp } from "./app";
import { startMessageConsumer, disconnectProducer } from "./services/kafka";
import prisma from "./services/prisma";
import { logger } from "./lib/logger";

function channelName(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

async function main() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
      ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "is_private" BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "invite_code" VARCHAR(50);
      ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_created_by_id_fkey') THEN
          ALTER TABLE "rooms" ADD CONSTRAINT "rooms_created_by_id_fkey" 
          FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    logger.info("Database schema auto-sync verified");
  } catch (schemaErr) {
    logger.warn({ schemaErr }, "Schema auto-sync warning (continuing)");
  }

  for (const slug of channelSlugs) {
    await prisma.room.upsert({
      where: { slug },
      create: { slug, name: channelName(slug) },
      update: {},
    });
  }

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
