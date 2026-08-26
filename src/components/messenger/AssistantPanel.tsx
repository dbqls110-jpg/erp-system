"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageContent } from "@/components/messenger/MessageContent";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import { cn } from "@/lib/utils";

type AssistantStatus = "pending" | "accepted" | "processing" | "completed" | "error";

interface AssistantTurn {
  id: string;
  question: string;
  answer: string | null;
  status: AssistantStatus;
  errorMsg: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface AssistantResponse {
  turns: AssistantTurn[];
  bridge: { online: boolean; lastSeenAt: string | null };
}

const TERMINAL_STATUSES: AssistantStatus[] = ["completed", "error"];
const POLLING_TIMEOUT_MS = 3 * 60 * 1000;

// 뒤로가기 버튼은 MessengerDock 헤더에 있다. 같은 자리에 두 개를 두면 헷갈린다.
export function AssistantPanel() {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [bridge, setBridge] = useState<AssistantResponse["bridge"] | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const pollingStartedAt = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchAssistant = useCallback(async (): Promise<AssistantResponse | null> => {
    try {
      const res = await fetch("/api/assistant?limit=30");
      if (!res.ok) return null;
      const data = (await res.json()) as AssistantResponse;
      setTurns(data.turns);
      setBridge(data.bridge);
      return data;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const stopPolling = useCallback(() => {
    setPollingId(null);
    pollingStartedAt.current = null;
  }, []);

  const startPolling = useCallback((turnId: string) => {
    pollingStartedAt.current = Date.now();
    setTimedOut(false);
    setPollingId(turnId);
  }, []);

  const pollAssistant = useCallback(async () => {
    if (!pollingId) return;
    const startedAt = pollingStartedAt.current;
    if (startedAt !== null && Date.now() - startedAt >= POLLING_TIMEOUT_MS) {
      stopPolling();
      setTimedOut(true);
      return;
    }

    const data = await fetchAssistant();
    const target = data?.turns.find((turn) => turn.id === pollingId);
    if (target && TERMINAL_STATUSES.includes(target.status)) stopPolling();
  }, [fetchAssistant, pollingId, stopPolling]);

  useEffect(() => {
    void (async () => {
      const data = await fetchAssistant();
      const lastTurn = data?.turns[data.turns.length - 1];
      if (lastTurn && !TERMINAL_STATUSES.includes(lastTurn.status)) {
        startPolling(lastTurn.id);
      }
    })();
  }, [fetchAssistant, startPolling]);

  useVisiblePolling(
    () => {
      void pollAssistant();
    },
    2000,
    { immediate: false, refreshKey: pollingId ?? "idle" },
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, timedOut]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || !bridge?.online || sending) return;

    setSending(true);
    setInput("");
    setSendError(null);
    setTimedOut(false);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json()) as { id?: string; error?: string; pendingId?: string };

      if (!res.ok) {
        const message = data.error ?? "전송 실패";
        setSendError(message);
        setInput(text);
        if (res.status === 409 && data.pendingId) startPolling(data.pendingId);
        return;
      }

      const turnId = data.id;
      if (!turnId) {
        setSendError("전송 실패");
        setInput(text);
        return;
      }

      setTurns((current) => [
        ...current,
        {
          id: turnId,
          question: text,
          answer: null,
          status: "pending",
          errorMsg: null,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);
      startPolling(turnId);
    } catch {
      setSendError("전송 실패");
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {loading && (
          <p className="py-8 text-center text-xs text-muted-foreground">대화를 불러오는 중입니다.</p>
        )}
        {!loading && turns.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <Sparkles className="size-6" />
            <p className="text-xs">ERP 비서에게 무엇이든 물어보세요.</p>
          </div>
        )}
        {turns.map((turn, index) => {
          const isWaiting =
            index === turns.length - 1 && !TERMINAL_STATUSES.includes(turn.status);
          return (
            <div key={turn.id} className="space-y-1.5">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-1.5 text-xs leading-relaxed text-primary-foreground">
                  {turn.question}
                </div>
              </div>
              {turn.status === "error" && turn.errorMsg && (
                <p className="px-1 text-[10px] text-muted-foreground">{turn.errorMsg}</p>
              )}
              {turn.status === "completed" && turn.answer !== null && (
                <div className="flex justify-start">
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-1.5 text-xs leading-relaxed text-foreground",
                    )}
                  >
                    <MessageContent content={turn.answer} />
                  </div>
                </div>
              )}
              {isWaiting && (
                <p className="px-1 text-[10px] text-muted-foreground">
                  {timedOut && index === turns.length - 1 ? "응답이 너무 오래 걸립니다" : "생각하는 중…"}
                </p>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-border px-3 py-2.5">
        {bridge && !bridge.online && (
          <p className="mb-1.5 text-[10px] text-muted-foreground">AI 가 지금 꺼져 있습니다</p>
        )}
        {sendError && <p className="mb-1.5 text-[10px] text-destructive">{sendError}</p>}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="ERP 비서에게 질문"
            className="h-8 flex-1 text-xs"
            disabled={!bridge?.online || sending}
          />
          <Button
            size="icon"
            onClick={() => void handleSend()}
            disabled={!input.trim() || !bridge?.online || sending}
            className="size-8 shrink-0"
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
