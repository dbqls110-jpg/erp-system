"use client";

import { parseMessage } from "@/lib/messageSegments";
import { ResultTable } from "./ResultTable";

/**
 * 메시지 본문 렌더러. 메신저 페이지와 플로팅 위젯이 같이 쓴다.
 *
 * 두 화면이 각자 렌더러를 가지면 표가 한쪽에만 보이는 식으로 갈린다.
 * 파싱 규칙은 @/lib/messageSegments 에 있다.
 */

function LinkifiedText({ value }: { value: string }) {
  const parts = value.split(/(https?:\/\/[^\s]+)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 break-all"
            onClick={(event) => event.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </span>
  );
}

export function MessageContent({ content }: { content: string }) {
  const segments = parseMessage(content);

  // 표가 없으면 예전과 동일한 인라인 렌더. 사람이 쓴 메시지는 전부 이 경로를 탄다.
  if (segments.every((s) => s.kind === "text")) {
    return <LinkifiedText value={content} />;
  }

  return (
    <div className="space-y-2">
      {segments.map((seg, i) =>
        seg.kind === "table" ? (
          <ResultTable key={i} payload={seg.value} />
        ) : seg.value.trim() ? (
          <LinkifiedText key={i} value={seg.value.trim()} />
        ) : null,
      )}
    </div>
  );
}
