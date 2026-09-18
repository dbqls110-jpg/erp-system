ALTER TABLE "venues" ADD COLUMN "createdById" TEXT;

CREATE INDEX "venues_createdById_createdAt_idx" ON "venues"("createdById", "createdAt");

ALTER TABLE "venues"
  ADD CONSTRAINT "venues_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
