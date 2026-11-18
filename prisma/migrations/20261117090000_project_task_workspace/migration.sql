ALTER TABLE "checklist_items"
  ADD COLUMN "assigneeId" TEXT,
  ADD COLUMN "taskStatus" TEXT NOT NULL DEFAULT 'todo',
  ADD COLUMN "nextCheckDate" TEXT,
  ADD COLUMN "dueDate" TEXT,
  ADD COLUMN "waitingOn" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "checklist_items"
  ADD CONSTRAINT "checklist_items_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "checklist_items_taskStatus_check"
    CHECK ("taskStatus" IN ('todo', 'in_progress', 'waiting')),
  ADD CONSTRAINT "checklist_items_version_check" CHECK ("version" >= 0);

CREATE INDEX "checklist_items_assigneeId_isDone_nextCheckDate_idx"
  ON "checklist_items"("assigneeId", "isDone", "nextCheckDate");
CREATE INDEX "checklist_items_projectId_isDone_order_idx"
  ON "checklist_items"("projectId", "isDone", "order");

-- Existing task IDs, completion history, projects and financial records are unchanged.
-- The table remains internal: never grant a browser/anonymous role direct access.
ALTER TABLE "checklist_items" ENABLE ROW LEVEL SECURITY;
