"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Paperclip, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageContent } from "@/components/messenger/MessageContent";
import { ProposalCard } from "@/components/messenger/ProposalCard";
import { parseProposals, stripProposals } from "@/lib/assistantProposal";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import { useMessenger } from "@/lib/messenger-store";
import { cn } from "@/lib/utils";
import { imageFileFromClipboard, isImageAttachment } from "@/lib/messengerPaste";

const MAX_ASSISTANT_IMAGE_SIZE = 50 * 1024 * 1024;

type AssistantStatus = "pending" | "accepted" | "processing" | "completed" | "error";

interface AssistantTurn {
  id: string;
  question: string;
  answer: string | null;
  status: AssistantStatus;
  /** 이미 적용/취소한 제안. 목록 응답에만 있고 폴링 응답에는 없다. */
  proposalStates?: { index: number; state: "done" | "cancelled" }[];
  errorMsg: string | null;
  createdAt: string;
  completedAt: string | null;
  attachment: AssistantAttachment | null;
}

interface AssistantAttachment {
  driveFileId: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
}

interface AssistantResponse {
  turns: AssistantTurn[];
  bridge: { online: boolean; lastSeenAt: string | null };
}

interface AssistantPollResponse {
  turn: AssistantTurn;
  bridge: AssistantResponse["bridge"];
}

const TERMINAL_STATUSES: AssistantStatus[] = ["completed", "error"];
const POLLING_TIMEOUT_MS = 3 * 60 * 1000;

// 뒤로가기 버튼은 MessengerDock 헤더에 있다. 같은 자리에 두 개를 두면 헷갈린다.
export function AssistantPanel({ initialQuestion = "" }: { initialQuestion?: string }) {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [bridge, setBridge] = useState<AssistantResponse["bridge"] | null>(null);
  const [input, setInput] = useState(initialQuestion);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const pollingStartedAt = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 목록을 불러오면 서버가 읽음 처리하므로 배지를 바로 내리려면 대화 목록을 다시 받아야 한다.
  const { refresh: refreshBadges } = useMessenger();

  const fetchAssistant = useCallback(async (): Promise<AssistantResponse | null> => {
    try {
      const res = await fetch("/api/assistant?limit=30");
      if (!res.ok) return null;
      const data = (await res.json()) as AssistantResponse;
      setTurns(data.turns);
      setBridge(data.bridge);
      void refreshBadges();
      return data;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, [refreshBadges]);

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

    try {
      const res = await fetch(`/api/assistant?job=${encodeURIComponent(pollingId)}`);
      if (!res.ok) return;

      const data = (await res.json()) as AssistantPollResponse;
      setTurns((current) =>
        current.map((turn) => (turn.id === data.turn.id ? data.turn : turn)),
      );
      setBridge(data.bridge);
      if (TERMINAL_STATUSES.includes(data.turn.status)) {
        stopPolling();
        void refreshBadges();
      }
    } catch {
      // 일시적인 네트워크 오류는 기존처럼 다음 폴링에서 다시 시도한다.
    }
  }, [pollingId, stopPolling, refreshBadges]);

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

  function chooseImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSendError("ERP 비서에는 사진 파일만 첨부할 수 있습니다.");
      return;
    }
    if (file.size > MAX_ASSISTANT_IMAGE_SIZE) {
      setSendError("사진은 50MB 이하만 첨부할 수 있습니다.");
      return;
    }
    setSendError(null);
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  function clearPendingImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    chooseImage(event.target.files?.[0] ?? null);
    // 같은 사진을 다시 선택해도 change 이벤트가 발생하도록 초기화한다.
    event.target.value = "";
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const file = imageFileFromClipboard(event.clipboardData.items);
    if (!file) return;
    event.preventDefault();
    chooseImage(file);
  }

  async function handleSend() {
    const text = input.trim();
    if ((!text && !pendingImage) || !bridge?.online || sending) return;

    setSending(true);
    setInput("");
    setSendError(null);
    setTimedOut(false);

    const imageToSend = pendingImage;

    try {
      const form = new FormData();
      form.set("message", text);
      if (imageToSend) form.set("file", imageToSend.file);
      const res = await fetch("/api/assistant", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        id?: string;
        error?: string;
        pendingId?: string;
        attachment?: AssistantAttachment | null;
      };

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

      clearPendingImage();

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
          attachment: data.attachment ?? null,
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
              {/* 질문이 없는 턴은 비서가 먼저 보낸 알림(가입 신청 등)이다. 답변만 그린다. */}
              {turn.question && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] space-y-2 rounded-2xl rounded-tr-sm bg-primary px-3 py-1.5 text-xs leading-relaxed text-primary-foreground">
                    {turn.attachment && isImageAttachment(turn.attachment.mimeType) && (
                      <a href={turn.attachment.url} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={turn.attachment.url}
                          alt={turn.attachment.name}
                          className="max-h-64 max-w-full rounded-lg object-contain"
                          loading="lazy"
                        />
                      </a>
                    )}
                    {turn.question && <span className="block whitespace-pre-wrap">{turn.question}</span>}
                  </div>
                </div>
              )}
              {turn.status === "error" && turn.errorMsg && (
                <p className="px-1 text-[10px] text-muted-foreground">{turn.errorMsg}</p>
              )}
              {turn.status === "completed" && turn.answer !== null && (
                <>
                  {/* 제안은 본문에서 빼고 카드로 그린다. JSON 을 그대로 보여줄 이유가 없다. */}
                  {stripProposals(turn.answer) && (
                    <div className="flex justify-start">
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-1.5 text-xs leading-relaxed text-foreground",
                        )}
                      >
                        <MessageContent content={stripProposals(turn.answer)} />
                      </div>
                    </div>
                  )}
                  {parseProposals(turn.answer).map((proposal, proposalIndex) => (
                    <ProposalCard
                      key={`${turn.id}-${proposalIndex}`}
                      proposal={proposal}
                      // 서버가 답변을 다시 읽어 같은 자리의 제안인지 대조한다.
                      index={proposalIndex}
                      jobId={turn.id}
                      initialState={turn.proposalStates?.find((s) => s.index === proposalIndex)?.state}
                    />
                  ))}
                </>
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
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingImage.previewUrl} alt="보낼 사진 미리보기" className="size-10 rounded object-cover" />
            <ImageIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{pendingImage.file.name}</span>
            <button
              type="button"
              onClick={clearPendingImage}
              className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
              aria-label="사진 첨부 선택 취소"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={!bridge?.online || sending}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={!bridge?.online || sending}
            className="size-8 shrink-0"
            aria-label="ERP 비서에 사진 첨부"
            title="사진 첨부 (최대 50MB)"
          >
            <Paperclip className="size-3.5" />
          </Button>
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
            onPaste={handlePaste}
            placeholder="ERP 비서에게 질문"
            className="h-8 flex-1 text-xs"
            disabled={!bridge?.online || sending}
          />
          <Button
            size="icon"
            onClick={() => void handleSend()}
            disabled={(!input.trim() && !pendingImage) || !bridge?.online || sending}
            className="size-8 shrink-0"
            aria-label="질문 전송"
            title="질문 전송"
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
