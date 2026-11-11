import { randomUUID, createHash } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessMenu, canEditMenu } from "@/lib/permissions";
import { isExternal } from "@/lib/calendarVisibility";
import { isDotReadOnly } from "@/lib/dotPolicy";
import { parsePartyQuoteTarget, validatePartyQuote, type PartyQuoteTarget } from "@/lib/partyQuotePolicy";
import { preparePartyQuoteFolder, reservePartyQuoteDriveId, uploadPartyQuoteToDrive, verifyPartyQuoteInDrive } from "@/lib/googleDrive";

export class PartyQuoteError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export const partyQuoteWhere = (target: PartyQuoteTarget) => target.kind === "customer" ? { customerId: target.id } : { partnerId: target.id };

export async function requirePartyQuoteAccess(input: unknown, edit = false) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new PartyQuoteError("로그인이 필요합니다.", 401);
  const user = session.user;
  if (user.active === false || isDotReadOnly(user.role) || isExternal(user)) throw new PartyQuoteError("견적서 접근 권한이 없습니다.", 403);
  let target: PartyQuoteTarget;
  try { target = parsePartyQuoteTarget(input); }
  catch { throw new PartyQuoteError("견적서를 연결할 거래처·파트너를 확인해 주세요.", 400); }
  const menu = target.kind === "customer" ? "customers" : "partners";
  if (!await canAccessMenu(user.id, menu) || (edit && !await canEditMenu(user.id, menu, user.role))) throw new PartyQuoteError("견적서 접근 권한이 없습니다.", 403);
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { active: true, isAgent: true, partnerId: true, customerId: true, venueId: true } });
  if (!account || !account.active || account.isAgent || account.partnerId || account.customerId || account.venueId) throw new PartyQuoteError("견적서 접근 권한이 없습니다.", 403);
  const party = target.kind === "customer"
    ? await prisma.customer.findUnique({ where: { id: target.id }, select: { id: true, name: true } })
    : await prisma.partner.findUnique({ where: { id: target.id }, select: { id: true, name: true } });
  if (!party) throw new PartyQuoteError("해당 거래처·파트너를 찾지 못했습니다.", 404);
  return { user, target, party };
}

export async function listPartyQuoteRows(input: unknown) {
  const { target } = await requirePartyQuoteAccess(input);
  return prisma.partyQuote.findMany({ where: partyQuoteWhere(target), orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, name: true, mimeType: true, size: true, status: true, createdAt: true } });
}

async function claimQuote(id: string) {
  const token = randomUUID();
  const now = new Date();
  const claim = await prisma.partyQuote.updateMany({ where: { id, status: { not: "ready" }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 5 * 60_000) } });
  return claim.count === 1 ? token : null;
}

async function finishQuote(id: string, token: string) {
  const row = await prisma.partyQuote.findUniqueOrThrow({ where: { id } });
  if (!row.driveFileId || !await verifyPartyQuoteInDrive({ ...row, driveFileId: row.driveFileId })) return false;
  const result = await prisma.partyQuote.updateMany({ where: { id, leaseToken: token }, data: { status: "ready", leaseToken: null, leaseUntil: null } });
  return result.count === 1;
}

export async function savePartyQuote(input: unknown, data: FormData) {
  const { user, target, party } = await requirePartyQuoteAccess(input, true);
  const file = data.get("file");
  const uploadId = data.get("uploadId");
  if (!(file instanceof File) || typeof uploadId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(uploadId)) throw Error("첨부파일을 다시 선택해 주세요.");
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw Error("견적서는 파일당 10MB 이하만 첨부할 수 있습니다.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const format = validatePartyQuote(file, buffer);
  const hash = createHash("sha256").update(buffer).digest("hex");
  const where = partyQuoteWhere(target);
  const existingId = await prisma.partyQuote.findUnique({ where: { id: uploadId } });
  if (existingId && (existingId.contentSha256 !== hash || existingId.customerId !== (target.kind === "customer" ? target.id : null)
    || existingId.partnerId !== (target.kind === "partner" ? target.id : null))) throw Error("업로드 식별자가 달라 다시 선택해 주세요.");
  // DB 유일키로 같은 거래처·파트너의 동일 파일 재시도와 동시 전송을 하나로 합친다.
  await prisma.partyQuote.createMany({ data: [{ id: uploadId, ...where, ...format, size: file.size, contentSha256: hash, createdById: user.id }], skipDuplicates: true });
  const row = await prisma.partyQuote.findFirstOrThrow({ where: { ...where, contentSha256: hash } });
  if (row.status === "ready") return { id: row.id, ready: true, reused: true };
  const token = await claimQuote(row.id);
  if (!token) return { id: row.id, ready: false, reused: true };
  try {
    const driveFileId = row.driveFileId ?? await reservePartyQuoteDriveId();
    if (!row.driveFileId) {
      const reserved = await prisma.partyQuote.updateMany({ where: { id: row.id, leaseToken: token, driveFileId: null }, data: { driveFileId } });
      if (reserved.count !== 1) throw Error("업로드 작업을 다시 확인해 주세요.");
    }
    const folderId = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('erp-private-party-quote-folders'))`;
      return preparePartyQuoteFolder({ ...party, kind: target.kind });
    }, { maxWait: 15_000, timeout: 120_000 });
    await uploadPartyQuoteToDrive({ ...row, driveFileId, buffer }, folderId);
    if (!await finishQuote(row.id, token)) throw Error("견적서 저장 확인이 필요합니다.");
    return { id: row.id, ready: true, reused: row.id !== uploadId };
  } catch (error) {
    await prisma.partyQuote.updateMany({ where: { id: row.id, leaseToken: token }, data: { status: "needs_attention", leaseToken: null, leaseUntil: null } }).catch(() => undefined);
    if (error instanceof Error && ["견적서 폴더에 외부 공유", "비공개 견적서 폴더가 중복", "Google Drive 소유자 인증이 만료"].some(prefix => error.message.startsWith(prefix))) throw Error(error.message);
    throw Error("저장 확인을 완료하지 못했습니다. ‘저장 복구’를 누르거나 같은 원본을 다시 선택해 주세요. 중복 파일은 만들지 않습니다.");
  }
}

export async function recoverPartyQuotes(input: unknown) {
  const { target } = await requirePartyQuoteAccess(input, true);
  const rows = await prisma.partyQuote.findMany({ where: { ...partyQuoteWhere(target), status: { not: "ready" } }, orderBy: { createdAt: "asc" }, take: 20 });
  let recovered = 0;
  for (const row of rows) {
    const token = await claimQuote(row.id);
    if (!token) continue;
    try { if (await finishQuote(row.id, token)) recovered++; }
    catch { /* 원본 불일치·인증 실패는 완료로 처리하지 않는다. */ }
    finally { await prisma.partyQuote.updateMany({ where: { id: row.id, leaseToken: token }, data: { status: "needs_attention", leaseToken: null, leaseUntil: null } }); }
  }
  return { recovered, pending: rows.length - recovered };
}
