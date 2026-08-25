CREATE TABLE IF NOT EXISTS "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manager" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT '거래중',
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "customers_status_idx" ON "customers"("status");

CREATE TABLE IF NOT EXISTS "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manager" TEXT,
    "phone" TEXT,
    "contractStatus" TEXT NOT NULL DEFAULT '대기',
    "contractStart" TEXT,
    "contractEnd" TEXT,
    "settlementType" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "partners_contractStatus_idx" ON "partners"("contractStatus");

CREATE TABLE IF NOT EXISTS "project_customers" (
    "projectId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_customers_pkey" PRIMARY KEY ("projectId","customerId")
);
CREATE INDEX IF NOT EXISTS "project_customers_customerId_idx" ON "project_customers"("customerId");

CREATE TABLE IF NOT EXISTS "project_partners" (
    "projectId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_partners_pkey" PRIMARY KEY ("projectId","partnerId")
);
CREATE INDEX IF NOT EXISTS "project_partners_partnerId_idx" ON "project_partners"("partnerId");
