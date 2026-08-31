"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Bookmark, FileText, Maximize2, MessageCircle, Paperclip, Send, Sparkles, X } from "lucide-react";
import { sendMessage, sendMessageWithAttachment } from "@/app/actions/message";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMessenger, type ConvItem, type MessengerUser } from "@/lib/messenger-store";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import { AssistantPanel } from "./AssistantPanel";
import { MessageContent } from "./MessageContent";
import { formatKoreanShortDate, formatKoreanTime, koreanDateKey } from "@/lib/dateFormat";
import { getSelfConversationUser } from "@/lib/messenger-conversation";

interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
  attachmentDriveFileId: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSizeBytes: number | null;
  attachmentUrl: string | null;
}

function initials(name: string | null) {
  return (name ?? "?").slice(0, 2).toUpperCase();
}

function timeStr(iso: string) {
  return koreanDateKey(iso) === koreanDateKey(new Date())
    ? formatKoreanTime(iso)
    : formatKoreanShortDate(iso);
}

function formatFileSize(size: number | null) {
  if (!size || size <= 0) return "파일";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
}

const MAX_MESSENGER_FILE_SIZE = 50 * 1024 * 1024;

/**
 * 우하단 플로팅 메신저.
 *
 * 대화 목록과 미읽음 수는 MessengerProvider 에서 받아 쓴다. 여기서 따로 폴링하면
 * 사이드 메신저와 폴러가 둘로 늘어난다. 열려 있는 대화의 메시지만 자체 폴링한다.
 */
export function MessengerDock({ myId, myUser }: { myId: string; myUser: MessengerUser }) {
  const {
    conversations,
    unreadTotal,
    refresh,
    users,
    loadUsers,
    dockOpen,
    setDockOpen,
    assistantOpen,
    setAssistantOpen,
    dockTarget,
    setDockTarget,
  } = useMessenger();

  const [messages, setMessages] = useState<Message[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setSelectedFile(null);
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
    setSelectedFile(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > MAX_MESSENGER_FILE_SIZE) {
      toast.error("메신저 첨부파일은 50MB 이하만 보낼 수 있습니다.");
      setSelectedFile(null);
      event.target.value = "";
      return;
    }
    setSelectedFile(file);
    // 같은 파일을 다시 선택해도 change 이벤트가 발생하도록 초기화한다.
    event.target.value = "";
  }

  function clearSelectedFile() {
    setSelectedFile(null);
  }

  async function handleSend() {
    const text = input.trim();
    if ((!text && !selectedFile) || !dockTarget) return;
    setSending(true);
    setInput("");
    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.set("file", selectedFile);
        await sendMessageWithAttachment(dockTarget.id, text, formData);
        setSelectedFile(null);
      } else {
        await sendMessage(dockTarget.id, text);
      }
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

  const selfConversationUser = getSelfConversationUser(myUser);
  const selfConversation = conversations.find((c) => c.other.id === myId);
  const recentConversations = conversations.filter((c) => c.other.id !== myId);
  const convUserIds = new Set(recentConversations.map((c) => c.other.id));
  const otherUsers = users.filter((u) => !convUserIds.has(u.id));

  return (
    <div className="fixed right-5 bottom-5 z-40 flex h-[32rem] max-h-[calc(100vh-2.5rem)] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
      {/* 헤더 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        {assistantOpen ? (
          <>
            <button
              onClick={() => setAssistantOpen(false)}
              aria-label="대화 목록으로"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </button>
            <Sparkles className="size-4 text-primary" />
            <span className="truncate text-sm font-medium">ERP 비서</span>
          </>
        ) : dockTarget ? (
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

      {assistantOpen ? (
        <AssistantPanel />
      ) : !dockTarget ? (
        /* 대화 목록 */
        <div className="flex-1 overflow-y-auto">
          {/* 자기 대화는 사람 목록과 구분하고, 대화가 없어도 바로 메모를 시작할 수 있게 고정한다. */}
          <button
            onClick={() => openConversation(selfConversationUser, selfConversation ?? undefined)}
            aria-label="나에게 메모 보내기"
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
            )}
          >
            <div className="relative shrink-0">
              <Avatar className="size-8">
                <AvatarImage src={selfConversationUser.image ?? undefined} />
                <AvatarFallback className="bg-muted text-[10px]">{initials(myUser.name)}</AvatarFallback>
              </Avatar>
              <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border border-background bg-primary text-primary-foreground">
                <Bookmark className="size-2.5" aria-hidden="true" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-sm font-medium">나에게</span>
                {selfConversation?.lastMsg && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{timeStr(selfConversation.lastMsg.createdAt)}</span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {selfConversation?.lastMsg?.attachmentName
                  ? `📎 ${selfConversation.lastMsg.attachmentName}`
                  : selfConversation?.lastMsg?.content || "메모·링크·파일을 여기에 저장해 두세요."}
              </p>
            </div>
          </button>

          {/* 비서는 자기 대화 다음에 고정해 직원 대화와 섞이지 않게 한다. */}
          <button
            onClick={() => setAssistantOpen(true)}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">ERP 비서</p>
              <p className="truncate text-xs text-muted-foreground">무엇이든 물어보세요</p>
            </div>
          </button>
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
              {recentConversations.map((conv) => (
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
                {dockTarget.id === myId
                  ? "메모·링크·파일을 이곳에 저장해 두세요."
                  : "아직 메시지가 없습니다."}
              </p>
            )}
            {messages.map((msg) => {
              const isMine = msg.senderId === myId;
              return (
                <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[85%] space-y-0.5", isMine && "flex flex-col items-end")}>
                    <div
                      className={cn(
                        "space-y-2 rounded-2xl px-3 py-1.5 text-xs leading-relaxed",
                        isMine
                          ? "rounded-tr-sm bg-primary text-primary-foreground"
                          : "rounded-tl-sm bg-muted text-foreground",
                      )}
                    >
                      {msg.content && <MessageContent content={msg.content} />}
                      {msg.attachmentDriveFileId && msg.attachmentUrl && (
                        <a
                          href={msg.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            "flex min-w-52 max-w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors",
                            isMine
                              ? "border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20"
                              : "border-border bg-background/70 hover:bg-background",
                          )}
                        >
                          <span className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg",
                            isMine ? "bg-primary-foreground/15" : "bg-primary/10 text-primary",
                          )}>
                            <FileText className="size-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">{msg.attachmentName ?? "첨부파일"}</span>
                            <span className={cn(
                              "block text-[10px]",
                              isMine ? "text-primary-foreground/70" : "text-muted-foreground",
                            )}>
                              {formatFileSize(msg.attachmentSizeBytes)} · Drive에서 열기
                            </span>
                          </span>
                        </a>
                      )}
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
            {selectedFile && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
                <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{selectedFile.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatFileSize(selectedFile.size)}</span>
                <button
                  type="button"
                  onClick={clearSelectedFile}
                  className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                  aria-label="첨부파일 선택 취소"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                className="size-8 shrink-0"
                aria-label="파일 첨부"
                title="파일 첨부 (최대 50MB)"
              >
                <Paperclip className="size-3.5" aria-hidden="true" />
              </Button>
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
                placeholder={dockTarget.id === myId ? "메모·링크·파일을 나에게 보내기" : "메시지 입력"}
                className="h-8 flex-1 text-xs"
                disabled={sending}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={(!input.trim() && !selectedFile) || sending}
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
