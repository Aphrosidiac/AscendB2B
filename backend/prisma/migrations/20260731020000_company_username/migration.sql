-- Signup is email + password + username. Existing rows predate the field, so
-- it's added nullable, backfilled from the email local-part, de-duplicated,
-- and only then constrained — adding it NOT NULL UNIQUE outright would fail
-- against any existing data.
ALTER TABLE "companies" ADD COLUMN "username" TEXT;

-- Strip anything outside the allowed handle charset; a local-part that reduces
-- to nothing falls back to a stable id-derived handle.
UPDATE "companies"
SET "username" = NULLIF(lower(regexp_replace(split_part("email", '@', 1), '[^a-zA-Z0-9_-]', '', 'g')), '');

UPDATE "companies"
SET "username" = 'company-' || right("id", 8)
WHERE "username" IS NULL;

-- Two addresses can share a local-part across domains; suffix the later ones.
WITH ranked AS (
  SELECT "id", "username",
         ROW_NUMBER() OVER (PARTITION BY "username" ORDER BY "createdAt", "id") AS rn
  FROM "companies"
)
UPDATE "companies" c
SET "username" = c."username" || '-' || r.rn
FROM ranked r
WHERE c."id" = r."id" AND r.rn > 1;

ALTER TABLE "companies" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "companies_username_key" ON "companies"("username");
