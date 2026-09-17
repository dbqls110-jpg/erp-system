"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/lib/auth";
import { sendVenueDaAdminReply, VenueDaRequestError } from "@/lib/venueDaMessenger";

/** ERP 메신저에서 VenueDA 방문자에게 답변을 보낸다. */
export async function sendVenueDaReply(threadId: string, body: string): Promise<void> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) throw new VenueDaRequestError(401, "로그인이 필요합니다.");
  await sendVenueDaAdminReply(threadId, user.id, user.role, body, user.name ?? undefined);
  revalidatePath("/messenger");
}
