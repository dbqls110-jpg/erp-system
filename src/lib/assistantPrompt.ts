import { buildAgentContext } from "@/lib/agentContext";

/**
 * ERP 비서에게 보낼 프롬프트를 만든다.
 *
 * 회사 PC 의 Codex 는 읽기 전용 샌드박스에서 돌고 우리 DB 에 접근할 수 없다.
 * 그래서 "우리 파트너 누구 있어?" 같은 질문에 답하려면 서버가 먼저 자료를 조회해
 * 프롬프트에 실어 보내야 한다. 자료 없이 물으면 AI 는 지어낸다.
 *
 * 관련 없는 자료까지 다 실으면 프롬프트가 길어지고 답이 흐려지므로,
 * 질문에 나온 낱말로 주제를 추려 그 자료만 붙인다.
 */

const SYSTEM_FRAME = [
  "당신은 행사 대관 중개 회사 '천우영'의 사내 ERP 비서입니다.",
  "직원이 업무 중 묻는 말에 짧고 정확하게 한국어로 답하세요.",
  "",
  "지켜야 할 것:",
  "- 아래 [ERP 자료]에 있는 내용만 사실로 다루세요. 자료에 없는 것은 지어내지 말고",
  "  '자료에 없습니다'라고 답한 뒤, 알아보려면 무엇을 해야 하는지 알려주세요.",
  "- 자료가 비어 있으면 비어 있다고 말하세요. 추측한 숫자나 상호를 대지 마세요.",
  "- 답은 문장 몇 개로 끝내세요. 표가 필요한 만큼 항목이 많을 때만 표를 쓰세요.",
].join("\n");

/**
 * 표로 답해야 할 때 쓰는 형식. 화면이 이 블록을 표로 그린다.
 * (파싱 규칙은 src/lib/messageSegments.ts 에 있다)
 */
const TABLE_FORMAT = [
  "항목이 여러 개라 표가 필요하면, 답 안에 아래 형식의 블록을 넣으세요.",
  "화면이 이 블록을 표로 그립니다. 블록 밖에는 짧은 설명만 두세요.",
  "",
  "```erp-table",
  '{"title":"제목","columns":[{"key":"name","label":"이름"},{"key":"cap","label":"수용","align":"right"}],',
  '"rows":[{"name":"구민회관","cap":300}],"notes":["표 아래에 붙는 주의사항"]}',
  "```",
  "",
  "컬럼 규칙:",
  '- 우리 DB 에 그 항목 자체가 없으면 컬럼에 "missing": true 를 넣으세요. 화면이 "정보 없음"으로 표시합니다.',
  "- 값을 모르는 칸은 null 로 두세요. 화면이 \"미상\"으로 표시합니다.",
  "- 이 둘을 뭉뚱그리지 마세요. 앞은 전화로 물어봐야 아는 것이고 뒤는 그 항목만 빠진 것이라,",
  "  읽는 사람이 다음에 할 행동이 다릅니다.",
].join("\n");

export interface AssistantPrompt {
  prompt: string;
  topics: string[];
  /** 붙인 자료의 대략적인 크기. 로그로 확인하기 위한 값. */
  contextChars: number;
}

export async function buildAssistantPrompt(question: string): Promise<AssistantPrompt> {
  const context = await buildAgentContext(question);
  const contextJson = JSON.stringify(context.data, null, 2);

  const parts = [SYSTEM_FRAME, "", TABLE_FORMAT, "", "[ERP 자료]"];

  if (context.topics.length === 0) {
    // 주제를 못 알아들었을 때 빈 객체만 던지면 AI 가 "자료가 없다"로 오해한다.
    // 자료를 붙이지 않았다는 사실 자체를 알려 준다.
    parts.push("(이 질문과 연결되는 ERP 자료를 찾지 못했습니다. 일반 상식으로 답하되,");
    parts.push(" 우리 회사 자료가 필요한 질문이면 어느 화면을 보면 되는지 알려주세요.)");
  } else {
    parts.push(contextJson);
  }

  parts.push("", "[질문]", question.trim());

  return {
    prompt: parts.join("\n"),
    topics: context.topics,
    contextChars: contextJson.length,
  };
}
