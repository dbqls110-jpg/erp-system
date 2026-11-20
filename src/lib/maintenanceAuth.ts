import { timingSafeEqual } from "node:crypto";
import { BRIDGE_AGENT_TYPES, bridgeApiKeyEnvNames } from "@/lib/agentTypes";

const integrationKeyNames = ["DOT_INTEGRATION_SECRET", "ERP_AGENT_API_KEY", "VENUEDA_INTEGRATION_SECRET", ...BRIDGE_AGENT_TYPES.flatMap(bridgeApiKeyEnvNames)];

export function verifyMaintenanceApiKey(request: Request) {
  const expected = process.env.ERP_MAINTENANCE_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const value = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || expected.length < 32 || expected.length > 256 || expected.trim() !== expected
    || integrationKeyNames.some(key => process.env[key] === expected) || !value || value.length > 256) return false;
  const a = Buffer.from(expected), b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyPrivateInboxCronKey(request: Request) {
  const expected = process.env.ERP_PRIVATE_INBOX_CRON_SECRET;
  const value = request.headers.get("x-erp-inbox-cron");
  const keyFormat = /^[a-f0-9]{64}$/;
  if (!expected || !value || !keyFormat.test(expected) || !keyFormat.test(value)
    || expected === process.env.ERP_MAINTENANCE_SECRET
    || integrationKeyNames.some(key => process.env[key] === expected)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(value, "hex"));
}
