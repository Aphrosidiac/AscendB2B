-- Signup no longer collects a company name: a trade account is opened from
-- contact details alone, and the legal entity name is captured afterwards via
-- the business-profile step. Existing rows all have a name, so this only
-- relaxes the constraint — no data changes.
--
-- Order and quotation creation both refuse to proceed while name IS NULL,
-- because it's the bill-to line on every invoice and quotation PDF.
ALTER TABLE "companies" ALTER COLUMN "name" DROP NOT NULL;
