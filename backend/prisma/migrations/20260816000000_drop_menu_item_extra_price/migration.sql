-- Reconciliation migration: MenuItem.extraPrice was already dropped directly on the
-- Railway database (outside of a tracked Prisma migration) before this file existed
-- locally. This file only documents that change so `prisma migrate dev` can build an
-- accurate shadow-database diff going forward; it is applied via `migrate resolve`
-- (bookkeeping only) rather than executed, since the DB already reflects this state.
ALTER TABLE "MenuItem" DROP COLUMN "extraPrice";
