ALTER TABLE "project_amounts" ADD COLUMN "costSettled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "project_cost_payments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectAmountId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL CHECK ("amount" > 0 AND "amount" <= 9007199254740991 AND "amount" = floor("amount")),
  "paidDate" TEXT NOT NULL,
  "memo" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_cost_payments_projectAmountId_fkey" FOREIGN KEY ("projectAmountId") REFERENCES "project_amounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "project_cost_payments_projectAmountId_paidDate_idx" ON "project_cost_payments"("projectAmountId", "paidDate");
