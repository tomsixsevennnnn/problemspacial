-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows with a stable initial order (by id) so the list doesn't reshuffle on first load
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn
  FROM "Package"
)
UPDATE "Package" p
SET "sortOrder" = ordered.rn
FROM ordered
WHERE p.id = ordered.id;
