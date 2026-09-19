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
      ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "server_id" TEXT;

      CREATE TABLE IF NOT EXISTS "servers" (
        "id" TEXT NOT NULL,
        "name" VARCHAR(100) NOT NULL,
        "slug" VARCHAR(50) NOT NULL,
        "description" VARCHAR(255),
        "icon_url" TEXT,
        "invite_code" VARCHAR(20) NOT NULL,
        "owner_id" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
      );

      CREATE TABLE IF NOT EXISTS "server_memberships" (
        "id" TEXT NOT NULL,
        "server_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "role" VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
        "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "server_memberships_pkey" PRIMARY KEY ("id")
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "servers_slug_key" ON "servers"("slug");
      CREATE UNIQUE INDEX IF NOT EXISTS "servers_invite_code_key" ON "servers"("invite_code");
      CREATE UNIQUE INDEX IF NOT EXISTS "server_memberships_server_id_user_id_key" ON "server_memberships"("server_id", "user_id");

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_created_by_id_fkey') THEN
          ALTER TABLE "rooms" ADD CONSTRAINT "rooms_created_by_id_fkey" 
          FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'servers_owner_id_fkey') THEN
          ALTER TABLE "servers" ADD CONSTRAINT "servers_owner_id_fkey" 
          FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'server_memberships_server_id_fkey') THEN
          ALTER TABLE "server_memberships" ADD CONSTRAINT "server_memberships_server_id_fkey" 
          FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'server_memberships_user_id_fkey') THEN
          ALTER TABLE "server_memberships" ADD CONSTRAINT "server_memberships_user_id_fkey" 
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_server_id_fkey') THEN
          ALTER TABLE "rooms" ADD CONSTRAINT "rooms_server_id_fkey" 
          FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    logger.info("Database multi-server schema auto-sync verified");
  } catch (schemaErr) {
    logger.warn({ schemaErr }, "Schema auto-sync warning (continuing)");
  }

  // Seed default server and link default channels
  try {
    const defaultOwner = await prisma.user.upsert({
      where: { username: "vortex_system" },
      create: { username: "vortex_system" },
      update: {},
    });

    const defaultServer = await prisma.server.upsert({
      where: { slug: "vortex-main" },
      create: {
        name: "Vortex Main",
        slug: "vortex-main",
        description: "Primary Server for Vortex Chat",
        inviteCode: "VORTEX-MAIN",
        ownerId: defaultOwner.id,
      },
      update: {
        name: "Vortex Main",
      },
    });

    for (const slug of channelSlugs) {
      await prisma.room.upsert({
        where: { slug },
        create: {
          slug,
          name: channelName(slug),
          serverId: defaultServer.id,
        },
        update: {
          serverId: defaultServer.id,
        },
      });
    }

    // Attach any legacy unassigned channels to defaultServer
    await prisma.room.updateMany({
      where: { serverId: null },
      data: { serverId: defaultServer.id },
    });
  } catch (seedErr) {
    logger.warn({ seedErr }, "Default server seed warning");
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
