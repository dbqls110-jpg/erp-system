import { prisma } from "@/lib/prisma";

/**
 * 에이전트 질문에 필요한 ERP 데이터를 붙여준다.
 *
 * 예전 구조는 AI 가 텍스트 검색으로 답을 추측하게 두었고, 그래서 잘린 데이터를 보고도
 * 확신에 차서 틀린 답을 냈다. 여기서는 서버가 먼저 DB 를 조회해 사실을 넘겨준다.
 *
 * 요청자는 항상 서버가 아는 값(AgentJob.userId)에서 오며, 질문 본문에서 뽑지 않는다.
 */

export type ContextTopic = "venues" | "customers" | "partners" | "projects";

const TOPIC_PATTERNS: Record<ContextTopic, RegExp> = {
  venues: /공간|장소|대관|행사장|체육관|공연장|강당|회의실|세미나|컨벤션|부스|바자회/,
  customers: /거래처|고객사|협력사|공급사/,
  partners: /파트너|협력업체|계약/,
  projects: /프로젝트|과업|진행\s*중인\s*일/,
};

export function detectTopics(question: string): ContextTopic[] {
  return (Object.keys(TOPIC_PATTERNS) as ContextTopic[]).filter((t) =>
    TOPIC_PATTERNS[t].test(question),
  );
}

export interface AgentContext {
  topics: ContextTopic[];
  data: Record<string, unknown>;
  /** 지도에 찍을 좌표. 좌표가 없는 항목은 포함하지 않는다. */
  pins: { id: string; name: string; lat: number; lng: number; note?: string }[];
}

export async function buildAgentContext(question: string): Promise<AgentContext> {
  const topics = detectTopics(question);
  const data: Record<string, unknown> = {};
  const pins: AgentContext["pins"] = [];

  await Promise.all(
    topics.map(async (topic) => {
      switch (topic) {
        case "customers": {
          const rows = await prisma.customer.findMany({
            select: { id: true, name: true, manager: true, phone: true, category: true, status: true },
            orderBy: { updatedAt: "desc" },
            take: 200,
          });
          data.customers = { count: rows.length, items: rows };
          break;
        }
        case "partners": {
          const rows = await prisma.partner.findMany({
            select: {
              id: true, name: true, job: true, phone: true,
              contractStatus: true, contractStart: true, contractEnd: true, settlementType: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 200,
          });
          data.partners = { count: rows.length, items: rows };
          break;
        }
        case "projects": {
          const rows = await prisma.project.findMany({
            where: { status: "active" },
            select: {
              id: true, name: true, client: true, deadline: true,
              progress: true, assignee: true, revenue: true, cost: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 100,
          });
          data.projects = { count: rows.length, items: rows };
          break;
        }
        case "venues": {
          // 공간 테이블은 아직 없다. 데이터가 들어오면 여기서 조회해 pins 를 채운다.
          // 그때까지는 "자료 없음"을 명시해, AI 가 지어내지 않도록 한다.
          data.venues = {
            available: false,
            note: "공간 DB 가 아직 비어 있습니다. 추측하지 말고 자료가 없다고 답하세요.",
          };
          break;
        }
      }
    }),
  );

  return { topics, data, pins };
}
