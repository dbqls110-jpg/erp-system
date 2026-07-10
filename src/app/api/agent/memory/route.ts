import { NextRequest, NextResponse } from "next/server";
import { verifyAgentApiKey } from "@/lib/agentAuth";
import { auditLog } from "@/lib/agentAudit";
import { prisma } from "@/lib/prisma";

const ALLOWED_AGENT_TYPES = ["hermes", "marketer"] as const;
const ALLOWED_SOURCES = ["discord", "erp", "manual"] as const;

type AgentType = typeof ALLOWED_AGENT_TYPES[number];
type Source = typeof ALLOWED_SOURCES[number];

// ─── POST /api/agent/memory ────────────────────────────────────────────────────
// agentType 기준으로 기억 저장. source는 기록용이고 조회 기준은 agentType.
// 단순 대화, 일회성 요청, 민감정보(API 키/비밀번호)는 저장하지 않을 것.

export async function POST(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    agentType: rawAgentType,
    source: rawSource = "erp",
    title: rawTitle,
    content: rawContent,
    tags: rawTags = [],
  } = body as {
    agentType?: string;
    source?: string;
    title?: string;
    content?: string;
    tags?: string[];
  };

  // agentType 검증
  if (!rawAgentType || !ALLOWED_AGENT_TYPES.includes(rawAgentType as AgentType)) {
    return NextResponse.json(
      { error: `agentType은 ${ALLOWED_AGENT_TYPES.join(" | ")} 중 하나여야 합니다.` },
      { status: 400 }
    );
  }
  const agentType = rawAgentType as AgentType;

  // source 검증
  const source: Source = ALLOWED_SOURCES.includes(rawSource as Source)
    ? (rawSource as Source)
    : "erp";

  // title 검증
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) return NextResponse.json({ error: "title은 필수입니다." }, { status: 400 });
  if (title.length > 100) return NextResponse.json({ error: "title은 100자 이하여야 합니다." }, { status: 400 });

  // content 검증
  const content = typeof rawContent === "string" ? rawContent.trim() : "";
  if (!content) return NextResponse.json({ error: "content는 필수입니다." }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "content는 2000자 이하여야 합니다." }, { status: 400 });

  // tags 검증
  const tags: string[] = Array.isArray(rawTags)
    ? rawTags.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim()).slice(0, 10)
    : [];

  const memory = await prisma.agentMemory.create({
    data: { agentType, source, title, content, tags },
  });

  await auditLog({
    method: "POST",
    endpoint: "/api/agent/memory",
    action: "save_memory",
    dryRun: false,
    payload: { agentType, source, title, tagsCount: tags.length },
    result: { memoryId: memory.id },
  });

  return NextResponse.json({ ok: true, memory: { id: memory.id, agentType, source, title, content, tags, createdAt: memory.createdAt } }, { status: 201 });
}

// ─── GET /api/agent/memory ────────────────────────────────────────────────────
// agentType 기준으로 기억 조회. 최신순 반환.

export async function GET(req: NextRequest) {
  if (!verifyAgentApiKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const rawAgentType = searchParams.get("agentType") ?? "";
  const limitRaw = parseInt(searchParams.get("limit") ?? "20");
  const limit = isNaN(limitRaw) ? 20 : Math.min(Math.max(1, limitRaw), 100);
  const tag = searchParams.get("tag") ?? null; // 특정 태그 필터 (선택)

  if (!rawAgentType || !ALLOWED_AGENT_TYPES.includes(rawAgentType as AgentType)) {
    return NextResponse.json(
      { error: `agentType 파라미터가 필요합니다. (${ALLOWED_AGENT_TYPES.join(" | ")})` },
      { status: 400 }
    );
  }
  const agentType = rawAgentType as AgentType;

  const memories = await prisma.agentMemory.findMany({
    where: {
      agentType,
      ...(tag ? { tags: { has: tag } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, agentType: true, source: true, title: true, content: true, tags: true, createdAt: true },
  });

  return NextResponse.json({
    agentType,
    limit,
    count: memories.length,
    memories,
  });
}
