ALTER TABLE "agent_bridge_heartbeats" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "agent_bridge_heartbeats" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "agent_bridge_heartbeats" ADD COLUMN IF NOT EXISTS "lastErrorAt" TIMESTAMP(3);
ALTER TABLE "agent_bridge_heartbeats" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "agent_bridge_heartbeats" ADD COLUMN IF NOT EXISTS "effort" TEXT;
