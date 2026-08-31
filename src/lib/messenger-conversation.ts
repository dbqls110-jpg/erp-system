export const SELF_CONVERSATION_LABEL = "나에게";

export interface ConversationUser {
  id: string;
  name: string | null;
}

interface ConversationWithUsers<T extends ConversationUser> {
  participantA: string;
  participantB: string;
  userA: T;
  userB: T;
}

/** 서버와 화면에서 같은 상대 이름 규칙을 쓰도록 자기 대화만 구분한다. */
export function getConversationOther<T extends ConversationUser>(
  conversation: ConversationWithUsers<T>,
  userId: string,
): T {
  const isSelfConversation =
    conversation.participantA === userId && conversation.participantB === userId;
  const other = conversation.participantA === userId ? conversation.userB : conversation.userA;

  // 자기 대화도 본인 프로필을 써야 하므로 이름만 구분용 문구로 바꾼다.
  return isSelfConversation ? { ...other, name: SELF_CONVERSATION_LABEL } : other;
}

/** 대화가 아직 없어도 고정 항목에서 본인 프로필을 재사용하도록 이름만 덮어쓴다. */
export function getSelfConversationUser<T extends ConversationUser>(user: T): T {
  return { ...user, name: SELF_CONVERSATION_LABEL };
}
