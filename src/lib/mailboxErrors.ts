export type MailboxErrorCode = "label_missing" | "api_disabled" | "permission_missing" | "reauthorize" | "authentication_failed" | "connection_timeout" | "connection_failed";
export class MailboxError extends Error {
  constructor(readonly code: MailboxErrorCode) { super(code); }
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}
export function mailboxErrorCode(error: unknown): MailboxErrorCode {
  if (error instanceof MailboxError) return error.code;
  if (error instanceof Error && error.message === "mailbox_label_missing") return "label_missing";
  const row = record(error), response = record(row?.response), data = record(response?.data), detail = record(data?.error);
  const details = Array.isArray(detail?.details) ? detail.details : [];
  const errors = Array.isArray(detail?.errors) ? detail.errors : [];
  const reasons = [...details, ...errors].map(value => record(value)?.reason);
  if (reasons.some(reason => reason === "SERVICE_DISABLED" || reason === "accessNotConfigured")) return "api_disabled";
  if (reasons.some(reason => reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" || reason === "insufficientPermissions")) return "permission_missing";
  if (data?.error === "invalid_grant" || response?.status === 401) return "reauthorize";
  if (row?.authenticationFailed === true || row?.code === "AUTHENTICATIONFAILED") return "authentication_failed";
  if (row?.code === "ETIMEDOUT" || row?.code === "ETIMEOUT" || row?.code === "ECONNECTIONTIMEDOUT") return "connection_timeout";
  return "connection_failed";
}
export function mailboxErrorMessage(code: string | null, provider = "gmail"): string {
  switch (code) {
    case "label_missing": return "설정한 Gmail 라벨을 찾지 못했습니다. Gmail에서 같은 이름의 라벨을 만들고 필요한 메일에 지정한 뒤 다시 수신해 주세요.";
    case "api_disabled": return "Google Cloud 프로젝트에서 Gmail API가 사용 중지되어 있습니다. 관리자가 Gmail API를 사용 설정한 뒤 다시 수신해 주세요.";
    case "permission_missing": return "Gmail 읽기 권한이 승인되지 않았습니다. 계정을 다시 연결하면서 메일 읽기 권한을 확인해 주세요.";
    case "reauthorize": return "메일 인증이 만료되었거나 취소됐습니다. 계정을 다시 연결해 주세요.";
    case "authentication_failed": return "네이버 인증에 실패했습니다. IMAP 사용 설정과 앱 비밀번호를 확인해 주세요. 일반 로그인 비밀번호는 사용할 수 없습니다.";
    case "connection_timeout": return "메일 서버 응답 시간이 초과됐습니다. 잠시 후 다시 수신해 주세요.";
    default: return provider === "naver" ? "네이버 메일을 연결하지 못했습니다. IMAP 사용 설정·앱 비밀번호·메일함 이름을 확인한 뒤 다시 시도해 주세요." : "메일을 가져오지 못했습니다. 라벨·메일함 설정과 연결 권한을 확인한 뒤 다시 시도해 주세요.";
  }
}
