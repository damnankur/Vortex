-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "is_private" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "invite_code" VARCHAR(50);
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_created_by_id_fkey'
  ) THEN
    ALTER TABLE "rooms" ADD CONSTRAINT "rooms_created_by_id_fkey" 
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
