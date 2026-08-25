import { notFound } from "next/navigation";
import { MessageContent } from "@/components/messenger/MessageContent";

/**
 * 개발 전용 컴포넌트 미리보기.
 *
 * 메신저 답변 표 같은 화면은 로그인해야 볼 수 있는데, 그러면 UI 를 고칠 때마다
 * 실제 계정으로 대화를 만들어야 확인이 된다. 여기서는 고정 예시 데이터로 같은
 * 컴포넌트를 그려 본다.
 *
 * DB 를 건드리지 않고, 프로덕션에서는 아래 가드로 404 가 된다.
 */
export const dynamic = "force-dynamic";

const SAMPLE = `11월 27일(토) 300명 조건으로 찾은 결과입니다.

\`\`\`erp-table
{
  "title": "서울 · 11월 27일(토) · 300명 이상",
  "columns": [
    { "key": "name", "label": "공간명" },
    { "key": "district", "label": "자치구" },
    { "key": "capacity", "label": "수용", "align": "right" },
    { "key": "price7h", "label": "대관료(7h 환산)", "align": "right" },
    { "key": "weekend", "label": "주말" },
    { "key": "meal", "label": "취식", "missing": true },
    { "key": "phone", "label": "문의" }
  ],
  "rows": [
    { "name": "구로구민회관 대공연장", "district": "구로구", "capacity": 700, "price7h": "1,050,000원", "weekend": "가능", "meal": null, "phone": "02-860-3114" },
    { "name": "성동문화회관 소극장", "district": "성동구", "capacity": 320, "price7h": "630,000원", "weekend": "가능", "meal": null, "phone": "02-3395-9500" },
    { "name": "강북청소년센터 강당", "district": "강북구", "capacity": 400, "price7h": null, "weekend": "가능", "meal": null, "phone": "02-6715-6600" },
    { "name": "양천구민회관", "district": "양천구", "capacity": 550, "price7h": "875,000원", "weekend": "미상", "meal": null, "phone": "02-2620-3114" }
  ],
  "notes": [
    "취식 가능 여부는 우리 DB 에 없는 항목입니다. 4곳 모두 전화 확인이 필요합니다.",
    "강북청소년센터 강당은 요금 정보가 비어 있어 문의가 필요합니다.",
    "대관료는 기준시간이 공간마다 달라 7시간 기준으로 환산한 값입니다. 실제 견적과 다를 수 있습니다."
  ]
}
\`\`\`

예약 링크가 필요하면 말씀 주세요.`;

const PLAIN = "내일 오후 3시에 구로구민회관 답사 갑니다. https://map.kakao.com 위치 확인해주세요.";

function Panel({ label, content }: { label: string; content: string }) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-1.5 text-xs leading-relaxed text-foreground">
          <MessageContent content={content} />
        </div>
      </div>
    </section>
  );
}

export default function DevPreviewPage() {
  // 프로덕션에는 이 경로가 존재하지 않는다.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-base font-semibold text-foreground">
          컴포넌트 미리보기 (개발 전용)
        </h1>

        {/* 플로팅 위젯 폭(22rem)에서 표가 어떻게 접히는지 확인 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            플로팅 위젯 폭(22rem)에서
          </p>
          <div className="w-[22rem] rounded-2xl border border-border bg-background p-3">
            <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-1.5 text-xs leading-relaxed text-foreground">
              <MessageContent content={SAMPLE} />
            </div>
          </div>
        </div>

        <Panel label="전체 화면 폭에서" content={SAMPLE} />
        <Panel label="표 없는 일반 메시지 (기존 동작)" content={PLAIN} />
      </div>
    </div>
  );
}
