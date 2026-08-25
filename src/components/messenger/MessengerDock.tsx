"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Maximize2, MessageCircle, Send, X } from "lucide-react";
import { sendMessage } from "@/app/actions/message";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMessenger, type ConvItem, type MessengerUser } from "@/lib/messenger-store";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import { MessageContent } from "./MessageContent";

interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
}

function initials(name: string | null) {
  return (name ?? "?").slice(0, 2).toUpperCase();
}

function timeStr(iso: string) {
  const d = new Date(iso);
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday
    ? d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

/**
 * 우하단 플로팅 메신저.
 *
 * 대화 목록과 미읽음 수는 MessengerProvider 에서 받아 쓴다. 여기서 따로 폴링하면
 * 사이드 메신저와 폴러가 둘로 늘어난다. 열려 있는 대화의 메시지만 자체 폴링한다.
 */
export function MessengerDock({ myId }: { myId: string }) {
  const {
    conversations,
    unreadTotal,
    refresh,
    users,
    loadUsers,
    dockOpen,
    setDockOpen,
    dockTarget,
    setDockTarget,
  } = useMessenger();

  const [messages, setMessages] = useState<Message[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchMessages = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/messenger/messages?conversationId=${id}`);
      if (res.ok) setMessages(await res.json());
    } catch {
      // 다음 폴링에서 회복된다.
    }
  }, []);

  // 열려 있는 대화만 8초 폴링. 위젯이 닫혀 있으면 convId 가 없어 아무것도 하지 않는다.
  useVisiblePolling(
    () => {
      if (dockOpen && convId) fetchMessages(convId);
    },
    8000,
    { refreshKey: convId },
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Esc 로 닫기. 화면 위에 떠 있는 패널이라 키보드 탈출구가 있어야 한다.
  useEffect(() => {
    if (!dockOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDockOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dockOpen, setDockOpen]);

  const openConversation = useCallback(
    (user: MessengerUser, existing?: ConvItem) => {
      setDockTarget(user);
      setMessages([]);
      const id =
        existing?.conversationId ??
        conversations.find((c) => c.other.id === user.id)?.conversationId ??
        null;
      setConvId(id);
      if (id) fetchMessages(id);
      // 포커스는 렌더 이후에 줘야 한다.
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [conversations, fetchMessages, setDockTarget],
  );

  function backToList() {
    setDockTarget(null);
    setConvId(null);
    setMessages([]);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !dockTarget) return;
    setSending(true);
    setInput("");
    try {
      await sendMessage(dockTarget.id, text);
      // 첫 메시지면 대화가 방금 생겼으므로 목록을 다시 받아 id 를 찾아야 한다.
      const res = await fetch("/api/messenger/conversations");
      if (res.ok) {
        const convs: ConvItem[] = await res.json();
        const found = convs.find((c) => c.other.id === dockTarget.id);
        if (found) {
          setConvId(found.conversationId);
          await fetchMessages(found.conversationId);
        }
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "전송 실패");
      setInput(text); // 실패한 메시지를 잃지 않게 되돌린다.
    } finally {
      setSending(false);
    }
  }

  // 닫힌 상태: 버튼만
  if (!dockOpen) {
    return (
      <button
        onClick={() => {
          setDockOpen(true);
          loadUsers();
        }}
        aria-label={
          unreadTotal > 0 ? `메신저 열기, 안 읽은 메시지 ${unreadTotal}건` : "메신저 열기"
        }
        className="fixed right-5 bottom-5 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none"
      >
        <MessageCircle className="size-5" />
        {unreadTotal > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unreadTotal > 9 ? "9+" : unreadTotal}
          </span>
        )}
      </button>
    );
  }

  const convUserIds = new Set(conversations.map((c) => c.other.id));
  const otherUsers = users.filter((u) => !convUserIds.has(u.id));

  return (
    <div className="fixed right-5 bottom-5 z-40 flex h-[32rem] max-h-[calc(100vh-2.5rem)] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
      {/* 헤더 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        {dockTarget ? (
          <>
            <button
              onClick={backToList}
              aria-label="대화 목록으로"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </button>
            <Avatar className="size-6">
              <AvatarImage src={dockTarget.image ?? undefined} />
              <AvatarFallback className="bg-muted text-[10px]">
                {initials(dockTarget.name)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-medium">{dockTarget.name ?? "직원"}</span>
          </>
        ) : (
          <>
            <MessageCircle className="size-4 text-primary" />
            <span className="text-sm font-semibold">메신저</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/messenger"
            onClick={() => setDockOpen(false)}
            aria-label="전체 화면으로 보기"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Maximize2 className="size-3.5" />
          </Link>
          <button
            onClick={() => setDockOpen(false)}
            aria-label="메신저 닫기"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {!dockTarget ? (
        /* 대화 목록 */
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && otherUsers.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <MessageCircle className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">다른 직원이 없습니다.</p>
            </div>
          )}
          {conversations.length > 0 && (
            <>
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                최근 대화
              </p>
              {conversations.map((conv) => (
                <button
                  key={conv.conversationId}
                  onClick={() => openConversation(conv.other, conv)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="relative shrink-0">
                    <Avatar className="size-8">
                      <AvatarImage src={conv.other.image ?? undefined} />
                      <AvatarFallback className="bg-muted text-[10px]">
                        {initials(conv.other.name)}
                      </AvatarFallback>
                    </Avatar>
                    {conv.unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-white">
                        {conv.unread > 9 ? "9+" : conv.unread}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-sm font-medium">
                        {conv.other.name ?? "직원"}
                      </span>
                      {conv.lastMsg && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {timeStr(conv.lastMsg.createdAt)}
                        </span>
                      )}
                    </div>
                    {conv.lastMsg && (
                      <p
                        className={cn(
                          "truncate text-xs",
                          conv.unread > 0
                            ? "font-medium text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {conv.lastMsg.senderId === myId ? "나: " : ""}
                        {conv.lastMsg.content}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}
          {otherUsers.length > 0 && (
            <>
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                전체 직원
              </p>
              {otherUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => openConversation(user)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                >
                  <Avatar className="size-8 shrink-0">
                    <AvatarImage src={user.image ?? undefined} />
                    <AvatarFallback className="bg-muted text-[10px]">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">{user.name ?? "직원"}</span>
                </button>
              ))}
            </>
          )}
        </div>
      ) : (
        /* 대화 내용 */
        <>
          <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">
                아직 메시지가 없습니다.
              </p>
            )}
            {messages.map((msg) => {
              const isMine = msg.senderId === myId;
              return (
                <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[85%] space-y-0.5", isMine && "flex flex-col items-end")}>
                    <div
                      className={cn(
                        "rounded-2xl px-3 py-1.5 text-xs leading-relaxed",
                        isMine
                          ? "rounded-tr-sm bg-primary text-primary-foreground"
                          : "rounded-tl-sm bg-muted text-foreground",
                      )}
                    >
                      <MessageContent content={msg.content} />
                    </div>
                    <span className="px-1 text-[10px] text-muted-foreground">
                      {timeStr(msg.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="shrink-0 border-t border-border px-3 py-2.5">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="메시지 입력"
                className="h-8 flex-1 text-xs"
                disabled={sending}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="size-8 shrink-0"
              >
                <Send className="size-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
