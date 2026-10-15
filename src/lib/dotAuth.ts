import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { DOT_ACCOUNT_ID, DOT_ROLE } from "@/lib/dotPolicy";
import { BRIDGE_AGENT_TYPES, bridgeApiKeyEnvNames } from "@/lib/agentTypes";

export class DotRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function configuredDotSecret() {
  const secret = process.env.DOT_INTEGRATION_SECRET;
  if (!secret || secret.length < 32 || secret.length > 256 || secret.trim() !== secret) return null;
  const writeKeys = ["ERP_AGENT_API_KEY", "VENUEDA_INTEGRATION_SECRET", "ERP_MAINTENANCE_SECRET", ...BRIDGE_AGENT_TYPES.flatMap(bridgeApiKeyEnvNames)];
  // A misconfigured reused key is not a dedicated read-only credential.
  if (writeKeys.some(name => process.env[name] === secret)) return null;
  return secret;
}

// Never reuse ERP_AGENT_API_KEY or bridge keys: those authorize writes elsewhere.
export function verifyDotSecret(value: unknown): boolean {
  const expected = configuredDotSecret();
  if (!expected || typeof value !== "string" || value.length > 256) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function dotCredentialFingerprint() {
  const secret = configuredDotSecret();
  return secret ? createHash("sha256").update(secret).digest("hex") : null;
}

export function verifyDotApiKey(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") && verifyDotSecret(header.slice(7));
}

export async function getActiveDotAccount() {
  const user = await prisma.user.findUnique({
    where: { id: DOT_ACCOUNT_ID },
    select: { id: true, name: true, email: true, role: true, active: true, isAgent: true, agentType: true },
  });
  if (!user || !user.active || !user.isAgent || user.agentType !== "dot" || user.role !== DOT_ROLE) {
    throw new DotRequestError(403, "DOT 계정이 비활성화되어 있거나 설정되지 않았습니다.");
  }
  return user;
}

export function dotErrorResponse(error: unknown) {
  return Response.json({ error: error instanceof DotRequestError ? error.message : "DOT 요청을 처리하지 못했습니다." },
    { status: error instanceof DotRequestError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
