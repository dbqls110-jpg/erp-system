import { timingSafeEqual } from "node:crypto";
import { BRIDGE_AGENT_TYPES, bridgeApiKeyEnvNames } from "@/lib/agentTypes";

export function verifyMaintenanceApiKey(request: Request) {
  const expected = process.env.ERP_MAINTENANCE_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const value = header.startsWith("Bearer ") ? header.slice(7) : "";
  const otherKeys = ["DOT_INTEGRATION_SECRET", "ERP_AGENT_API_KEY", "VENUEDA_INTEGRATION_SECRET", ...BRIDGE_AGENT_TYPES.flatMap(bridgeApiKeyEnvNames)];
  if (!expected || expected.length < 32 || expected.length > 256 || expected.trim() !== expected
    || otherKeys.some(key => process.env[key] === expected) || !value || value.length > 256) return false;
  const a = Buffer.from(expected), b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}
