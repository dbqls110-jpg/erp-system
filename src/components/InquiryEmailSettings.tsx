import { getInquiryEmailStatus } from "@/lib/inquiryEmail";
import { connectInquiryEmail, pauseInquiryEmail, resumeInquiryEmail } from "@/app/actions/inquiryEmail";

export async function InquiryEmailSettings({ connectionFailed = false }: { connectionFailed?: boolean }) {
  const { config, uncertain } = await getInquiryEmailStatus();
  const error = config?.lastErrorCode;
  return <section className="space-y-2 rounded-xl border p-4 text-sm" aria-label="내 이메일 알림 설정">
    <h2 className="font-semibold">내 이메일 알림 · {config?.enabled ? "켜짐" : "꺼짐"}</h2>
    <p className="text-muted-foreground">dbqls110@gmail.com으로 문의 종류와 ERP 링크만 보냅니다. 클라우드에서 약 5분 간격으로 확인하며 실행 지연이 생길 수 있습니다.</p>
    <p className="text-xs text-muted-foreground">연결·재개할 때 이전 문의는 보내지 않고 본인에게 연결 점검 메일 1건을 보냅니다. 메일 발송과 문의 읽음은 별개입니다.</p>
    {connectionFailed && <p role="alert" className="text-destructive">Gmail 연결을 완료하지 못했습니다. 본인 계정과 메일 발송 권한으로 다시 연결해 주세요. 기존 Drive 앱 권한은 해제하지 마세요.</p>}
    {error && <p role="alert" className="text-destructive">{error === "gmail_api_disabled" ? "Google 프로젝트의 Gmail API 또는 메일 발송 권한을 확인한 뒤 다시 연결해 주세요." : error === "auth_required" ? "메일 발송 권한을 다시 연결해 주세요. 기존 Drive 연결은 해제하지 마세요." : "알림 처리에 확인이 필요합니다. 연결·재개 후 상태를 확인해 주세요."}</p>}
    {uncertain > 0 && <p role="status">전송 확인 필요 {uncertain}건 · 중복 방지를 위해 자동 재발송하지 않습니다.</p>}
    <div className="flex flex-wrap gap-2">
      <form action={connectInquiryEmail}><button className="rounded-md border px-3 py-2">{config?.connectedAt ? "Gmail 다시 연결" : "Gmail 연결"}</button></form>
      {config?.connectedAt && !config.enabled && <form action={resumeInquiryEmail}><button className="rounded-md border px-3 py-2">점검 메일 보내고 알림 켜기</button></form>}
      {config?.enabled && <form action={pauseInquiryEmail}><button className="rounded-md border px-3 py-2">알림 끄기</button></form>}
    </div>
    {config?.lastCheckedAt && <p className="text-xs text-muted-foreground">마지막 확인: {config.lastCheckedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>}
  </section>;
}
