-- Server-owned table: browser/REST roles must not bypass ERP session checks.
-- The migration owner is also the Prisma runtime role and retains owner access.
ALTER TABLE "project_cost_payments" ENABLE ROW LEVEL SECURITY;
