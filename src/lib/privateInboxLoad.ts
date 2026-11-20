import { preserveMailReadState, type PrivateInboxView } from "./privateInboxPolicy";

export type PrivateInboxLoad =
  | { kind: "loading" }
  | { kind: "loaded"; data: PrivateInboxView }
  | { kind: "failed"; data: PrivateInboxView | null; message: string };

export function receiveInbox(previous: PrivateInboxLoad, data: PrivateInboxView): PrivateInboxLoad {
  const old = previous.kind === "loading" ? null : previous.data;
  return { kind: "loaded", data: old ? preserveMailReadState(old, data) : data };
}
export function failInbox(previous: PrivateInboxLoad, message: string): PrivateInboxLoad {
  return { kind: "failed", data: previous.kind === "loading" ? null : previous.data, message };
}
