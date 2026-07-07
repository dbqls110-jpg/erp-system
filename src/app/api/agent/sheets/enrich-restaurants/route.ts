import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { makeSheetsClient, resolveSpreadsheetId } from "@/lib/googleClient";
import {
  searchNaverLocal,
  getNameSimilarity,
  addressOverlap,
  type NaverLocalItem,
} from "@/lib/naverSearch";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type EnrichAction = "updated" | "multiple_candidates" | "no_phone_found" | "no_match" | "api_error" | "skip";

interface RowResult {
  rowNum: number;        // 시트 행 번호 (1-indexed, 헤더=1)
  name: string;
  originalPhone: string;
  address: string;
  action: EnrichAction;
  newPhone?: string;
  newStatus?: string;
  matchedTitle?: string;
  matchedAddr?: string;
  naverTotal?: number;
  error?: string;
}

// ─── 컬럼 감지 ────────────────────────────────────────────────────────────────

function detectColumns(headers: string[]): {
  nameCol: number;
  phoneCol: number;
  addrCol: number;
  statusCol: number;
} {
  const find = (keywords: string[]) =>
    headers.findIndex((h) => {
      const n = h.toLowerCase().replace(/\s/g, "");
      return keywords.some((k) => n.includes(k));
    });

  // 도로명주소 우선, 없으면 주소
  const roadAddrIdx = find(["도로명주소", "도로명"]);
  const addrIdx = find(["주소", "address"]);

  return {
    nameCol: find(["식당명", "상호명", "업체명", "가게명", "이름", "name"]),
    phoneCol: find(["전화번호", "연락처", "전화", "phone", "tel"]),
    addrCol: roadAddrIdx !== -1 ? roadAddrIdx : addrIdx,
    statusCol: find(["확인상태", "검증상태", "비고", "상태", "메모", "status", "remark"]),
  };
}

// ─── 전화번호 보강 필요 여부 ──────────────────────────────────────────────────

function needsEnrichment(phone: string): boolean {
  if (!phone || phone.trim() === "" || phone.trim() === "-") return true;
  const lower = phone.trim().toLowerCase();
  return lower.includes("확인 필요") || lower === "없음" || lower === "미확인" || lower === "unknown";
}

// ─── 열 인덱스 → 열 문자 (A, B, ..., Z, AA, ...) ────────────────────────────

function colLetter(idx: number): string {
  let r = "";
  let i = idx + 1;
  while (i > 0) {
    const rem = (i - 1) % 26;
    r = String.fromCharCode(65 + rem) + r;
    i = Math.floor((i - 1) / 26);
  }
  return r;
}

// ─── 이름 + 주소 기반 최적 매칭 결정 ─────────────────────────────────────────

interface MatchDecision {
  action: "confident" | "multiple" | "no_match";
  item?: NaverLocalItem;
}

function decideMatch(storedName: string, storedAddr: string, items: NaverLocalItem[]): MatchDecision {
  // 이름 유사도 "high" 이상인 후보만 추출
  const candidates = items.filter((item) => {
    const sim = getNameSimilarity(storedName, item.title);
    if (sim === "exact") return true;
    if (sim === "high") {
      // 이름이 서로 포함 관계지만 모호할 경우 주소 겹침 추가 확인
      const overlapA = addressOverlap(storedAddr, item.address);
      const overlapR = addressOverlap(storedAddr, item.roadAddress);
      return Math.max(overlapA, overlapR) >= 1;
    }
    return false;
  });

  if (candidates.length === 0) return { action: "no_match" };
  if (candidates.length === 1) return { action: "confident", item: candidates[0] };

  // 후보가 여럿: exact 매칭이 1개 있으면 그것 선택
  const exactCandidates = candidates.filter(
    (item) => getNameSimilarity(storedName, item.title) === "exact"
  );
  if (exactCandidates.length === 1) return { action: "confident", item: exactCandidates[0] };

  return { action: "multiple" };
}

// ─── 딜레이 ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    spreadsheetId: rawId,
    spreadsheetUrl: rawUrl,
    sheetName,
    limit: rawLimit = 20,
    dryRun = false,
  } = body as {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    sheetName?: string;
    limit?: number;
    dryRun?: boolean;
  };

  // spreadsheetId 결정
  const resolved = resolveSpreadsheetId(rawId, rawUrl ?? null, undefined);
  if (!resolved) {
    const hint = rawUrl
      ? "spreadsheetUrl 형식이 올바르지 않습니다."
      : "spreadsheetId 또는 spreadsheetUrl이 필요합니다.";
    return NextResponse.json({ error: hint }, { status: 400 });
  }

  const limit = Math.min(Math.max(1, typeof rawLimit === "number" ? Math.floor(rawLimit) : 20), 50);

  const hasCredentials = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  if (!hasCredentials) {
    return NextResponse.json(
      { error: "NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 환경변수가 필요합니다." },
      { status: 503 }
    );
  }

  try {
    const sheets = makeSheetsClient();

    // ── 시트 데이터 읽기 ───────────────────────────────────────────────────
    const range = sheetName ? `${sheetName}` : "A:ZZ";
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: resolved.id,
      range,
    });

    const rows = readRes.data.values ?? [];
    if (rows.length < 2) {
      return NextResponse.json({ error: "시트에 데이터가 없거나 헤더만 있습니다." }, { status: 400 });
    }

    const headers = (rows[0] as string[]).map((h) => String(h ?? "").trim());
    const cols = detectColumns(headers);

    if (cols.nameCol === -1) {
      return NextResponse.json(
        { error: `식당명/상호명 컬럼을 찾을 수 없습니다. 헤더: [${headers.join(", ")}]` },
        { status: 400 }
      );
    }
    if (cols.phoneCol === -1) {
      return NextResponse.json(
        { error: `전화번호/연락처 컬럼을 찾을 수 없습니다. 헤더: [${headers.join(", ")}]` },
        { status: 400 }
      );
    }

    // ── 처리 대상 행 선별 ──────────────────────────────────────────────────
    interface TargetRow {
      rowNum: number;    // 1-indexed (1=header)
      name: string;
      phone: string;
      addr: string;
    }

    const targets: TargetRow[] = [];
    for (let i = 1; i < rows.length && targets.length < limit; i++) {
      const row = rows[i] as string[];
      const name = String(row[cols.nameCol] ?? "").trim();
      const phone = String(row[cols.phoneCol] ?? "").trim();
      const addr = cols.addrCol !== -1 ? String(row[cols.addrCol] ?? "").trim() : "";

      if (!name) continue;
      if (!needsEnrichment(phone)) continue;

      targets.push({ rowNum: i + 1, name, phone, addr }); // rowNum: 시트는 1-indexed
    }

    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "보강할 행이 없습니다. 전화번호가 이미 기입되어 있거나 식당명이 비어 있는 행만 있습니다.",
        scanned: rows.length - 1,
        enriched: 0,
        results: [],
      });
    }

    // ── Naver API 검색 + 매칭 ─────────────────────────────────────────────
    const results: RowResult[] = [];
    const writes: { range: string; values: string[][] }[] = [];
    const sheetPrefix = sheetName ? `${sheetName}!` : "";

    for (const target of targets) {
      // 검색 쿼리: 식당명 + 주소 앞 3 토큰 (너무 길면 검색 정확도 하락)
      const addrPrefix = target.addr.split(/[\s,]+/).slice(0, 3).join(" ");
      const query = addrPrefix ? `${target.name} ${addrPrefix}` : target.name;

      await sleep(150); // Naver API 호출 간격

      let naverResult: Awaited<ReturnType<typeof searchNaverLocal>> | null = null;
      try {
        naverResult = await searchNaverLocal(query, 5);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "API 오류";
        results.push({
          rowNum: target.rowNum,
          name: target.name,
          originalPhone: target.phone,
          address: target.addr,
          action: "api_error",
          error: errMsg,
        });
        continue;
      }

      if (naverResult.total === 0 || naverResult.items.length === 0) {
        results.push({
          rowNum: target.rowNum,
          name: target.name,
          originalPhone: target.phone,
          address: target.addr,
          action: "no_match",
          naverTotal: 0,
        });
        continue;
      }

      const decision = decideMatch(target.name, target.addr, naverResult.items);

      if (decision.action === "confident" && decision.item) {
        const matched = decision.item;
        if (!matched.telephone) {
          // 매칭됐지만 전화번호 없음
          results.push({
            rowNum: target.rowNum,
            name: target.name,
            originalPhone: target.phone,
            address: target.addr,
            action: "no_phone_found",
            naverTotal: naverResult.total,
            matchedTitle: matched.title,
            matchedAddr: matched.roadAddress || matched.address,
          });
          continue;
        }

        const newStatus = "네이버 Local API 확인";
        results.push({
          rowNum: target.rowNum,
          name: target.name,
          originalPhone: target.phone,
          address: target.addr,
          action: "updated",
          newPhone: matched.telephone,
          newStatus,
          naverTotal: naverResult.total,
          matchedTitle: matched.title,
          matchedAddr: matched.roadAddress || matched.address,
        });

        // 실제 쓰기용 데이터 준비 (dryRun 아닐 때만 사용)
        const phoneCell = `${sheetPrefix}${colLetter(cols.phoneCol)}${target.rowNum}`;
        writes.push({ range: phoneCell, values: [[matched.telephone]] });
        if (cols.statusCol !== -1) {
          const statusCell = `${sheetPrefix}${colLetter(cols.statusCol)}${target.rowNum}`;
          writes.push({ range: statusCell, values: [[newStatus]] });
        }
      } else if (decision.action === "multiple") {
        const newStatus = "후보 다수 / 확인 필요";
        results.push({
          rowNum: target.rowNum,
          name: target.name,
          originalPhone: target.phone,
          address: target.addr,
          action: "multiple_candidates",
          newStatus,
          naverTotal: naverResult.total,
        });
        if (cols.statusCol !== -1) {
          const statusCell = `${sheetPrefix}${colLetter(cols.statusCol)}${target.rowNum}`;
          writes.push({ range: statusCell, values: [[newStatus]] });
        }
      } else {
        results.push({
          rowNum: target.rowNum,
          name: target.name,
          originalPhone: target.phone,
          address: target.addr,
          action: "no_match",
          naverTotal: naverResult.total,
        });
      }
    }

    // ── 시트 반영 (dryRun 아닌 경우) ──────────────────────────────────────
    let writeCount = 0;
    if (!dryRun && writes.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: resolved.id,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: writes,
        },
      });
      writeCount = writes.length;
    }

    const enrichedCount = results.filter((r) => r.action === "updated").length;

    await auditLog({
      method: "POST",
      endpoint: "/api/agent/sheets/enrich-restaurants",
      action: "enrich_restaurants",
      dryRun: dryRun === true,
      payload: { spreadsheetId: resolved.id, sheetName: sheetName ?? null, limit, targetCount: targets.length },
      result: { enrichedCount, writeCount },
    });

    return NextResponse.json({
      ok: true,
      dryRun: dryRun === true,
      spreadsheetId: resolved.id,
      sheetName: sheetName ?? null,
      detectedColumns: {
        name: cols.nameCol !== -1 ? `${colLetter(cols.nameCol)} (${headers[cols.nameCol]})` : null,
        phone: cols.phoneCol !== -1 ? `${colLetter(cols.phoneCol)} (${headers[cols.phoneCol]})` : null,
        address: cols.addrCol !== -1 ? `${colLetter(cols.addrCol)} (${headers[cols.addrCol]})` : null,
        status: cols.statusCol !== -1 ? `${colLetter(cols.statusCol)} (${headers[cols.statusCol]})` : null,
      },
      scanned: rows.length - 1,
      targets: targets.length,
      enriched: enrichedCount,
      ...(dryRun ? { note: "dryRun=true: 실제 시트 수정 없음" } : { writtenCells: writeCount }),
      results,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: "식당 시트 보강 실패", detail }, { status: 502 });
  }
}
