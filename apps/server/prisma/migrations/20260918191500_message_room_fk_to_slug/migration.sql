-- Align messages.roomId with the app's slug-based model.
-- Message rows reference Room by slug everywhere in the service layer;
-- the FK originally targeted rooms.id (uuid), so every insert failed with
-- P2003 and no message could ever be persisted. Table is empty, so the
-- column is simply retyped and re-pointed at rooms(slug).

ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_roomId_fkey";

ALTER TABLE "messages" ALTER COLUMN "roomId" SET DATA TYPE VARCHAR(50);

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "rooms"("slug")
  ON DELETE CASCADE ON UPDATE CASCADE;