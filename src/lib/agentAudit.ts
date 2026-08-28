import { prisma } from "@/lib/prisma";

interface AuditOptions {
  method: string;
  endpoint: string;
  action: string;
  dryRun: boolean;
  payload?: unknown;
  result?: unknown;
  /** Sensitive operations must fail closed if the audit record cannot be written. */
  required?: boolean;
}

export async function auditLog(opts: AuditOptions) {
  try {
    await prisma.agentAuditLog.create({
      data: {
        method: opts.method,
        endpoint: opts.endpoint,
        action: opts.action,
        dryRun: opts.dryRun,
        payload: opts.payload ? (opts.payload as object) : undefined,
        result: opts.result ? (opts.result as object) : undefined,
      },
    });
  } catch (error) {
    if (opts.required) throw error;
    // 일반적인 비핵심 감사 로그 실패는 기존 동작을 막지 않는다.
  }
}

export function isDryRun(req: Request | { nextUrl?: { searchParams: URLSearchParams } }, body?: Record<string, unknown>): boolean {
  if (body?.dryRun === true) return true;
  try {
    const url = (req as { nextUrl?: { searchParams: URLSearchParams } }).nextUrl;
    if (url?.searchParams.get("dryRun") === "true") return true;
  } catch {}
  return false;
}
