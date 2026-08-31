"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Send, MessageCircle, ArrowLeft, CalendarPlus, Sparkles, Paperclip, FileText, X, Bot } from "lucide-react";
import { sendMessage, sendMessageWithAttachment } from "@/app/actions/message";
import { createCalendarEvent } from "@/app/actions/calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toneBadgeClass } from "@/lib/badge-tone";
import { MessageContent } from "@/components/messenger/MessageContent";
import { AssistantPanel } from "@/components/messenger/AssistantPanel";
import { useMessenger } from "@/lib/messenger-store";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import { formatKoreanShortDate, formatKoreanTime, koreanDateKey } from "@/lib/dateFormat";

interface User {
  id: string;
  name: string | null;
  image: string | null;
  /**
   * 대화 목록 API 는 role 을 내려주지 않는다(상대를 표시하는 데 필요 없어서).
   * 필수로 두면 conversations 에서 온 상대를 이 타입으로 못 받는다.
   */
  role?: string;
  isAgent?: boolean;
  agentType?: string | null;
}

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

interface ContextMenu {
  x: number;
  y: number;
  message: Message;
}

const COLOR_OPTIONS = [
  { value: "blue",   label: "파랑",   class: "bg-blue-500" },
  { value: "green",  label: "초록",   class: "bg-green-500" },
  { value: "red",    label: "빨강",   class: "bg-red-500" },
  { value: "yellow", label: "노랑",   class: "bg-yellow-400" },
  { value: "purple", label: "보라",   class: "bg-purple-500" },
  { value: "gray",   label: "회색",   class: "bg-gray-400" },
];

const MAX_MESSENGER_FILE_SIZE = 50 * 1024 * 1024;

function initials(name: string | null) {
  return (name ?? "?").slice(0, 2).toUpperCase();
}

function timeStr(iso: string) {
  if (koreanDateKey(iso) === koreanDateKey(new Date())) return formatKoreanTime(iso);
  return formatKoreanShortDate(iso);
}

function formatFileSize(size: number | null) {
  if (!size || size <= 0) return "파일";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
}

export function MessengerView({ myId, users, todayDate }: { myId: string; users: User[]; todayDate: string }) {
  // 대화 목록은 AppShell 의 MessengerProvider 가 한 번만 폴링해 나눠준다.
  // 여기서 또 폴링하면 플로팅 위젯 · 헤더와 합쳐 요청이 세 배가 된다.
  const { conversations, refresh: refreshConversations } = useMessenger();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showList, setShowList] = useState(true);
  // 사람 대화와 배타적이다. 둘이 동시에 열리면 어느 쪽을 보고 있는지 알 수 없다.
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 우클릭 컨텍스트 메뉴
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // 캘린더 등록 모달
  const [calModal, setCalModal] = useState(false);
  const [calTitle, setCalTitle] = useState("");
  const [calDate, setCalDate] = useState(todayDate);
  const [calColor, setCalColor] = useState("blue");
  const [calSaving, setCalSaving] = useState(false);

  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/messenger/messages?conversationId=${convId}`);
      if (res.ok) setMessages(await res.json());
    } catch {}
  }, []);

  // 열려 있는 대화의 메시지만 자체 폴링한다. 대화 목록은 Provider 담당이다.
  useVisiblePolling(
    () => { if (selectedConvId) fetchMessages(selectedConvId); },
    8000,
    { refreshKey: selectedConvId },
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 컨텍스트 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const closeKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeKey);
    };
  }, [contextMenu]);

  function handleRightClick(e: React.MouseEvent, msg: Message) {
    e.preventDefault();
    // 뷰포트 벗어나지 않도록 위치 조정
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 60);
    setContextMenu({ x, y, message: msg });
  }

  function openAssistantForFile(message: Message) {
    if (!message.attachmentDriveFileId || !message.attachmentName) return;
    setAssistantDraft(
      `[첨부파일 이동 요청]\n파일명: ${message.attachmentName}\nDrive 파일 ID: ${message.attachmentDriveFileId}\n현재 저장 위치: 천우영 시스템/메신저\n요청: 이 파일을 <프로젝트명 또는 견적서> 폴더로 보내줘. 먼저 이동 제안만 보여줘.`,
    );
    setContextMenu(null);
    setAssistantOpen(true);
    setSelectedUser(null);
    setShowList(false);
  }

  function openCalModal(msg: Message) {
    setCalTitle(msg.content.slice(0, 60));
    setCalDate(todayDate);
    setCalColor("blue");
    setContextMenu(null);
    setCalModal(true);
  }

  async function handleCalSave() {
    if (!calTitle.trim()) return;
    setCalSaving(true);
    try {
      await createCalendarEvent({ title: calTitle.trim(), date: calDate, color: calColor });
      toast.success("캘린더에 일정이 등록됐습니다.");
      setCalModal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setCalSaving(false);
    }
  }

  function selectUser(user: User) {
    setAssistantOpen(false);
    const existing = conversations.find(c => c.other.id === user.id);
    setSelectedUser(user);
    setSelectedConvId(existing?.conversationId ?? null);
    setMessages([]);
    setSelectedFile(null);
    setShowList(false);
    inputRef.current?.focus();
    if (existing) fetchMessages(existing.conversationId);
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
    if ((!input.trim() && !selectedFile) || !selectedUser) return;
    setSending(true);
    const text = input.trim();
    const receiverId = selectedUser.id;
    setInput("");
    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.set("file", selectedFile);
        await sendMessageWithAttachment(receiverId, text, formData);
        setSelectedFile(null);
      } else {
        await sendMessage(receiverId, text);
      }

      // 첫 메시지면 대화가 방금 생겼으므로 id 를 찾아야 한다.
      const res = await fetch("/api/messenger/conversations");
      if (res.ok) {
        const convs: { conversationId: string; other: { id: string } }[] = await res.json();
        const found = convs.find(c => c.other.id === receiverId);
        if (found) {
          setSelectedConvId(found.conversationId);
          await fetchMessages(found.conversationId);
        }
      }
      // 헤더 배지와 플로팅 위젯도 같이 최신화된다.
      await refreshConversations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "전송 실패");
    } finally {
      setSending(false);
    }
  }

  const convUserIds = new Set(conversations.map(c => c.other.id));
  const recentUsers = conversations.map(c => c.other);
  const otherUsers = users.filter(u => !convUserIds.has(u.id));

  return (
    <>
      <div className="flex h-full bg-background">
        {/* 왼쪽 패널 */}
        <div className={cn(
          "w-full sm:w-72 shrink-0 border-r border-border flex flex-col",
          !showList && "hidden sm:flex"
        )}>
          <div className="h-14 px-4 flex items-center border-b border-border shrink-0">
            <MessageCircle size={16} className="text-primary mr-2" />
            <h2 className="text-sm font-semibold text-foreground">메신저</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* 비서는 사람이 아니라 목록 맨 위에 고정으로 둔다. 직원 사이에 섞이면 찾기 어렵다. */}
            <button
              onClick={() => { setAssistantDraft(""); setAssistantOpen(true); setSelectedUser(null); setShowList(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left",
                assistantOpen && "bg-accent",
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="size-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">ERP 비서</p>
                <p className="text-xs text-muted-foreground">무엇이든 물어보세요</p>
              </div>
            </button>

            {recentUsers.length === 0 && otherUsers.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <MessageCircle className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">다른 직원이 없습니다.</p>
              </div>
            )}
            {recentUsers.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-3 pb-1">최근 대화</p>
                {conversations.map((conv) => (
                  <button key={conv.conversationId} onClick={() => selectUser(conv.other)}
                    className={cn("w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left", selectedUser?.id === conv.other.id && "bg-accent")}>
                    <div className="relative shrink-0">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={conv.other.image ?? undefined} />
                        <AvatarFallback className="text-xs bg-muted">{initials(conv.other.name)}</AvatarFallback>
                      </Avatar>
                      {conv.unread > 0 && (
                        <Badge variant="outline" className={cn("absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold", toneBadgeClass("red"))}>
                          {conv.unread > 9 ? "9+" : conv.unread}
                        </Badge>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground truncate">{conv.other.name ?? "직원"}</span>
                        {conv.lastMsg && <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{timeStr(conv.lastMsg.createdAt)}</span>}
                      </div>
                      {conv.lastMsg && (
                        <p className={cn("text-xs truncate", conv.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                          {conv.lastMsg.senderId === myId ? "나: " : ""}
                          {conv.lastMsg.attachmentName ? `📎 ${conv.lastMsg.attachmentName}` : conv.lastMsg.content}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {otherUsers.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-3 pb-1">전체 직원</p>
                {otherUsers.map((user) => (
                  <button key={user.id} onClick={() => selectUser(user)}
                    className={cn("w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left", selectedUser?.id === user.id && "bg-accent")}>
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={user.image ?? undefined} />
                      <AvatarFallback className="text-xs bg-muted">{initials(user.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground truncate">{user.name ?? "직원"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 채팅 패널 */}
        <div className={cn("flex-1 flex flex-col", showList && "hidden sm:flex")}>
          {assistantOpen ? (
            <>
              <div className="h-14 px-4 flex items-center gap-3 border-b border-border shrink-0">
                <button onClick={() => setShowList(true)} className="sm:hidden text-muted-foreground hover:text-foreground mr-1">
                  <ArrowLeft className="size-3.5" />
                </button>
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="size-4 text-primary" />
                </div>
                <span className="text-sm font-semibold text-foreground">ERP 비서</span>
              </div>
              <AssistantPanel key={assistantDraft || "assistant"} initialQuestion={assistantDraft} />
            </>
          ) : !selectedUser ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
              <MessageCircle className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">왼쪽에서 직원을 선택하세요</p>
              <p className="text-xs text-muted-foreground/60">메시지 우클릭 → 캘린더 등록 가능</p>
            </div>
          ) : (
            <>
              <div className="h-14 px-4 flex items-center gap-3 border-b border-border shrink-0">
                <button onClick={() => setShowList(true)} className="sm:hidden text-muted-foreground hover:text-foreground mr-1">
                  <ArrowLeft className="size-3.5" />
                </button>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={selectedUser.image ?? undefined} />
                  <AvatarFallback className="text-xs bg-muted">{initials(selectedUser.name)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-foreground">{selectedUser.name}</span>
                </div>
                <span className="text-xs text-muted-foreground ml-auto">메시지 우클릭 → 캘린더 · 파일 정리</span>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <MessageCircle className="size-6 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">아직 메시지가 없습니다. 첫 메시지를 보내보세요!</p>
                  </div>
                )}
                {messages.map((msg) => {
                  const isMine = msg.senderId === myId;
                  return (
                    <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}
                      onContextMenu={(e) => handleRightClick(e, msg)}>
                      {!isMine && (
                        <Avatar className="h-6 w-6 mr-2 shrink-0 mt-0.5">
                          <AvatarImage src={selectedUser.image ?? undefined} />
                          <AvatarFallback className="text-[9px] bg-muted">{initials(selectedUser.name)}</AvatarFallback>
                        </Avatar>
                      )}
                      <div className={cn("max-w-[70%] space-y-0.5", isMine && "items-end flex flex-col")}>
                        <div className={cn(
                          "space-y-2 rounded-2xl px-3 py-2 text-sm leading-relaxed select-text cursor-context-menu",
                          isMine ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"
                        )}>
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
                              onClick={(event) => event.stopPropagation()}
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
                        <span className="text-[10px] text-muted-foreground px-1">{timeStr(msg.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div className="px-4 py-3 border-t border-border shrink-0">
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
                    className="h-9 w-9 shrink-0"
                    aria-label="파일 첨부"
                    title="파일 첨부 (최대 50MB)"
                  >
                    <Paperclip className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder={`${selectedUser.name ?? "직원"}에게 메시지 보내기`}
                    className="flex-1"
                    disabled={sending}
                  />
                  <Button size="icon" onClick={handleSend} disabled={(!input.trim() && !selectedFile) || sending}
                    className="h-9 py-2 bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                    aria-label="메시지 전송"
                    title="메시지 전송">
                    <Send className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.message.attachmentDriveFileId && (
            <button
              type="button"
              onClick={() => openAssistantForFile(contextMenu.message)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
            >
              <Bot className="size-3.5 text-primary" aria-hidden="true" />
              AI에게 파일 정리 요청
            </button>
          )}
          {contextMenu.message.content && (
            <button
              type="button"
              onClick={() => openCalModal(contextMenu.message)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
            >
              <CalendarPlus className="size-3.5 text-primary" />
              캘린더에 등록
            </button>
          )}
        </div>
      )}

      {/* 캘린더 등록 모달 */}
      <Dialog open={calModal} onOpenChange={(o) => { if (!o) setCalModal(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus size={16} className="text-primary" />
              캘린더에 일정 등록
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>제목</Label>
              <Input
                value={calTitle}
                onChange={e => setCalTitle(e.target.value)}
                placeholder="일정 제목"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>날짜</Label>
              <Input
                type="date"
                value={calDate}
                onChange={e => setCalDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>색상</Label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCalColor(c.value)}
                    title={c.label}
                    className={cn(
                      "w-6 h-6 rounded-full transition-all",
                      c.class,
                      calColor === c.value ? "ring-2 ring-offset-2 ring-foreground scale-110" : "opacity-60 hover:opacity-100"
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setCalModal(false)}>취소</Button>
              <Button size="sm" onClick={handleCalSave} disabled={!calTitle.trim() || calSaving}>
                {calSaving ? "등록 중..." : "등록"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
