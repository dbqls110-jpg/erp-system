import { describe, expect, it } from "vitest";
import {
  getConversationOther,
  getSelfConversationUser,
  SELF_CONVERSATION_LABEL,
} from "@/lib/messenger-conversation";

const owner = { id: "user-owner", name: "사장님", image: "owner.png" };
const colleague = { id: "user-colleague", name: "직원", image: "colleague.png" };

describe("getConversationOther", () => {
  it("자기 대화에서는 본인 프로필을 유지하고 이름만 나에게로 표시한다", () => {
    const conversation = {
      participantA: owner.id,
      participantB: owner.id,
      userA: owner,
      userB: owner,
    };

    expect(getConversationOther(conversation, owner.id)).toEqual({
      ...owner,
      name: SELF_CONVERSATION_LABEL,
    });
  });

  it("직원과의 대화에서는 상대 프로필을 그대로 표시한다", () => {
    const conversation = {
      participantA: owner.id,
      participantB: colleague.id,
      userA: owner,
      userB: colleague,
    };

    expect(getConversationOther(conversation, owner.id)).toBe(colleague);
  });
});

describe("getSelfConversationUser", () => {
  it("대화가 없어도 본인 사진을 가진 나에게 항목을 만들 수 있다", () => {
    expect(getSelfConversationUser(owner)).toEqual({
      ...owner,
      name: SELF_CONVERSATION_LABEL,
    });
  });
});
