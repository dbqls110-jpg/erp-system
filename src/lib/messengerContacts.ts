/**
 * 메신저에서 누가 누구에게 말을 걸 수 있는지.
 *
 * 외부인(파트너·공간 호스트·거래처 담당자)은 자기 **담당 직원** 한 명에게만 말을 건다.
 * 파트너끼리, 호스트가 파트너에게, 외부인이 아무 직원에게나 연락하는 길을 막는다 —
 * 우리 메신저는 회사 안 연락망이지 외부인들의 광장이 아니다.
 * 담당 직원이 아직 지정되지 않은 외부인은 아무에게도 말을 걸 수 없다(비어 있는 목록).
 * 내부 직원은 전과 같이 전원에게 말을 건다.
 *
 * 목록(누가 보이나)과 전송(실제로 보내지나)이 같은 규칙을 써야 한다. 목록만 가리면
 * 주소를 직접 쳐서 보내는 길이 남는다.
 */
import { isExternal, type Viewer } from "@/lib/calendarVisibility";

export interface ContactUser extends Viewer {
  /** 외부인의 담당 직원. 내부 직원이면 null. */
  staffUserId: string | null;
  active: boolean;
  isAgent: boolean;
}

export function isExternalContact(user: ContactUser): boolean {
  return isExternal(user);
}

/** 이 사람이 말을 걸 수 있는 상대의 Prisma where. 목록 API 와 메신저 페이지가 같이 쓴다. */
export function messengerContactWhere(me: ContactUser) {
  const base = { active: true, isAgent: false, id: { not: me.id }, role: { not: "pending" } };
  if (!me.active || me.isAgent) return { ...base, id: "__none__" };
  if (!isExternalContact(me)) return base;
  // 외부인은 담당 직원 한 명뿐. 지정 전이면 아무도 없다.
  return { ...base, id: me.staffUserId ?? "__none__" };
}

/** 보낼 수 있는지. 자기 자신(메모)은 언제나 된다. */
export function canMessage(sender: ContactUser, receiver: ContactUser & { active: boolean; isAgent: boolean }): boolean {
  if (!sender.active || sender.isAgent) return false;
  if (sender.id === receiver.id) return true;
  if (!receiver.active || receiver.isAgent || receiver.role === "pending") return false;
  if (!isExternalContact(sender)) {
    // 내부 직원끼리, 그리고 내부 직원 → 외부인은 된다.
    return true;
  }
  // 외부인은 담당 직원에게만. 담당 직원은 내부 직원이어야 한다.
  return sender.staffUserId !== null && sender.staffUserId === receiver.id && !isExternalContact(receiver);
}

export const NO_STAFF_MESSAGE = "담당 직원이 아직 지정되지 않았습니다. 관리자에게 문의해 주세요.";
