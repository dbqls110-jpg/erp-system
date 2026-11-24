ALTER TABLE "project_amounts" ADD COLUMN "quoteContentSha256" TEXT, ADD COLUMN "quoteItems" JSONB;
ALTER TABLE "project_upload_recoveries" ADD COLUMN "quoteItems" JSONB;
