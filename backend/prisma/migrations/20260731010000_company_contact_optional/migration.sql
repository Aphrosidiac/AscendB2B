-- Signup is now email + password only; contact name and phone move to the
-- business-profile step alongside the company name. Existing rows all have
-- values, so this only relaxes the constraints.
--
-- Ordering and quoting are blocked while any of name/contactName/phone is
-- NULL (assertProfileComplete) — the payment gateway bill payload and the
-- receipt/quotation PDFs all depend on them.
ALTER TABLE "companies" ALTER COLUMN "contactName" DROP NOT NULL;
ALTER TABLE "companies" ALTER COLUMN "phone" DROP NOT NULL;
