-- Additive only: do not infer invoice or payment dates from creation timestamps.
ALTER TABLE "project_amounts"
  ADD COLUMN "invoiceDate" TEXT,
  ADD COLUMN "paidDate" TEXT,
  ADD COLUMN "expectedPaymentDate" TEXT;

ALTER TABLE "company_finance_entries"
  ADD COLUMN "invoiceDate" TEXT,
  ADD COLUMN "paidDate" TEXT,
  ADD COLUMN "expectedPaymentDate" TEXT;
