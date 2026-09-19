-- CreateTable: servers
CREATE TABLE IF NOT EXISTS "servers" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "icon_url" TEXT,
    "invite_code" VARCHAR(20) NOT NULL,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: server_memberships
CREATE TABLE IF NOT EXISTS "server_memberships" (
    "id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_memberships_pkey" PRIMARY KEY ("id")
);

-- AlterTable: rooms
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "server_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "servers_slug_key" ON "servers"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "servers_invite_code_key" ON "servers"("invite_code");
CREATE UNIQUE INDEX IF NOT EXISTS "server_memberships_server_id_user_id_key" ON "server_memberships"("server_id", "user_id");
CREATE INDEX IF NOT EXISTS "server_memberships_user_id_idx" ON "server_memberships"("user_id");
CREATE INDEX IF NOT EXISTS "rooms_server_id_idx" ON "rooms"("server_id");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'servers_owner_id_fkey') THEN
    ALTER TABLE "servers" ADD CONSTRAINT "servers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'server_memberships_server_id_fkey') THEN
    ALTER TABLE "server_memberships" ADD CONSTRAINT "server_memberships_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'server_memberships_user_id_fkey') THEN
    ALTER TABLE "server_memberships" ADD CONSTRAINT "server_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_server_id_fkey') THEN
    ALTER TABLE "rooms" ADD CONSTRAINT "rooms_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
