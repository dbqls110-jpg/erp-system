"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Send, MessageCircle, ArrowLeft, CalendarPlus } from "lucide-react";
import { sendMessage } from "@/app/actions/message";
import { createCalendarEvent } from "@/app/actions/calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  name: string | null;
  image: string | null;
  role: string;
}

interface ConvItem {
  conversationId: string;
  other: User;
  lastMsg: { content: string; senderId: string; createdAt: string } | null;
  unread: number;
}

interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
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

function initials(name: string | null) {
  return (name ?? "?").slice(0, 2).toUpperCase();
}

function timeStr(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export function MessengerView({ myId, users }: { myId: string; users: User[] }) {
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showList, setShowList] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 우클릭 컨텍스트 메뉴
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // 캘린더 등록 모달
  const [calModal, setCalModal] = useState(false);
  const [calTitle, setCalTitle] = useState("");
  const [calDate, setCalDate] = useState(todayStr());
  const [calColor, setCalColor] = useState("blue");
  const [calSaving, setCalSaving] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messenger/conversations");
      if (res.ok) setConversations(await res.json());
    } catch {}
  }, []);

  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/messenger/messages?conversationId=${convId}`);
      if (res.ok) setMessages(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchConversations();
    const id = setInterval(fetchConversations, 20000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedConvId) return;
    fetchMessages(selectedConvId);
    const id = setInterval(() => fetchMessages(selectedConvId), 5000);
    return () => clearInterval(id);
  }, [selectedConvId, fetchMessages]);

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

  function openCalModal(msg: Message) {
    setCalTitle(msg.content.slice(0, 60));
    setCalDate(todayStr());
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
    const existing = conversations.find(c => c.other.id === user.id);
    setSelectedUser(user);
    setSelectedConvId(existing?.conversationId ?? null);
    setMessages([]);
    setShowList(false);
    inputRef.current?.focus();
    if (existing) fetchMessages(existing.conversationId);
  }

  async function handleSend() {
    if (!input.trim() || !selectedUser) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    try {
      await sendMessage(selectedUser.id, text);
      const res = await fetch("/api/messenger/conversations");
      if (res.ok) {
        const convs: ConvItem[] = await res.json();
        setConversations(convs);
        const found = convs.find(c => c.other.id === selectedUser.id);
        if (found) {
          setSelectedConvId(found.conversationId);
          await fetchMessages(found.conversationId);
        }
      }
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
      <div className="flex h-full bg-canvas-white">
        {/* 왼쪽 패널 */}
        <div className={cn(
          "w-full sm:w-72 shrink-0 border-r border-ash-gray flex flex-col",
          !showList && "hidden sm:flex"
        )}>
          <div className="h-14 px-4 flex items-center border-b border-ash-gray shrink-0">
            <MessageCircle size={16} className="text-deep-violet mr-2" />
            <h2 className="text-sm font-semibold text-deep-space-charcoal">메신저</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {recentUsers.length === 0 && otherUsers.length === 0 && (
              <p className="text-sm text-smoke-gray px-4 py-6">다른 직원이 없습니다.</p>
            )}
            {recentUsers.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-smoke-gray uppercase tracking-wider px-4 pt-3 pb-1">최근 대화</p>
                {conversations.map((conv) => (
                  <button key={conv.conversationId} onClick={() => selectUser(conv.other)}
                    className={cn("w-full flex items-center gap-3 px-4 py-3 hover:bg-hint-of-sky/50 transition-colors text-left", selectedUser?.id === conv.other.id && "bg-accent")}>
                    <div className="relative shrink-0">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={conv.other.image ?? undefined} />
                        <AvatarFallback className="text-xs bg-hint-of-sky">{initials(conv.other.name)}</AvatarFallback>
                      </Avatar>
                      {conv.unread > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-warm-fade text-white text-[9px] flex items-center justify-center font-bold">
                          {conv.unread > 9 ? "9+" : conv.unread}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-midnight-charcoal truncate">{conv.other.name ?? "직원"}</span>
                        {conv.lastMsg && <span className="text-[10px] text-smoke-gray shrink-0 ml-1">{timeStr(conv.lastMsg.createdAt)}</span>}
                      </div>
                      {conv.lastMsg && (
                        <p className={cn("text-xs truncate", conv.unread > 0 ? "text-midnight-charcoal font-medium" : "text-smoke-gray")}>
                          {conv.lastMsg.senderId === myId ? "나: " : ""}{conv.lastMsg.content}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {otherUsers.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-smoke-gray uppercase tracking-wider px-4 pt-3 pb-1">전체 직원</p>
                {otherUsers.map((user) => (
                  <button key={user.id} onClick={() => selectUser(user)}
                    className={cn("w-full flex items-center gap-3 px-4 py-3 hover:bg-hint-of-sky/50 transition-colors text-left", selectedUser?.id === user.id && "bg-accent")}>
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={user.image ?? undefined} />
                      <AvatarFallback className="text-xs bg-hint-of-sky">{initials(user.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-midnight-charcoal truncate">{user.name ?? "직원"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 채팅 패널 */}
        <div className={cn("flex-1 flex flex-col", showList && "hidden sm:flex")}>
          {!selectedUser ? (
            <div className="flex-1 flex flex-col items-center justify-center text-smoke-gray gap-2">
              <MessageCircle size={40} className="opacity-30" />
              <p className="text-sm">왼쪽에서 직원을 선택하세요</p>
              <p className="text-xs opacity-60">메시지 우클릭 → 캘린더 등록 가능</p>
            </div>
          ) : (
            <>
              <div className="h-14 px-4 flex items-center gap-3 border-b border-ash-gray shrink-0">
                <button onClick={() => setShowList(true)} className="sm:hidden text-smoke-gray hover:text-midnight-charcoal mr-1">
                  <ArrowLeft size={18} />
                </button>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={selectedUser.image ?? undefined} />
                  <AvatarFallback className="text-xs bg-hint-of-sky">{initials(selectedUser.name)}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-semibold text-deep-space-charcoal">{selectedUser.name}</span>
                <span className="text-xs text-smoke-gray ml-auto">메시지 우클릭 → 캘린더 등록</span>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 && (
                  <p className="text-xs text-smoke-gray text-center py-8">아직 메시지가 없습니다. 첫 메시지를 보내보세요!</p>
                )}
                {messages.map((msg) => {
                  const isMine = msg.senderId === myId;
                  return (
                    <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}
                      onContextMenu={(e) => handleRightClick(e, msg)}>
                      {!isMine && (
                        <Avatar className="h-6 w-6 mr-2 shrink-0 mt-0.5">
                          <AvatarImage src={selectedUser.image ?? undefined} />
                          <AvatarFallback className="text-[9px] bg-hint-of-sky">{initials(selectedUser.name)}</AvatarFallback>
                        </Avatar>
                      )}
                      <div className={cn("max-w-[70%] space-y-0.5", isMine && "items-end flex flex-col")}>
                        <div className={cn(
                          "px-3 py-2 rounded-2xl text-sm leading-relaxed select-text cursor-context-menu",
                          isMine ? "bg-deep-violet text-white rounded-tr-sm" : "bg-hint-of-sky text-midnight-charcoal rounded-tl-sm"
                        )}>
                          {msg.content}
                        </div>
                        <span className="text-[10px] text-smoke-gray px-1">{timeStr(msg.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div className="px-4 py-3 border-t border-ash-gray shrink-0">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder={`${selectedUser.name ?? "직원"}에게 메시지 보내기`}
                    className="flex-1"
                    disabled={sending}
                  />
                  <Button size="icon" onClick={handleSend} disabled={!input.trim() || sending}
                    className="bg-deep-violet hover:bg-deep-violet/90 text-white shrink-0" style={{ borderRadius: "9px" }}>
                    <Send size={15} />
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
          className="fixed z-50 bg-popover border border-ash-gray rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => openCalModal(contextMenu.message)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-midnight-charcoal hover:bg-hint-of-sky transition-colors"
          >
            <CalendarPlus size={14} className="text-deep-violet" />
            캘린더에 등록
          </button>
        </div>
      )}

      {/* 캘린더 등록 모달 */}
      <Dialog open={calModal} onOpenChange={(o) => { if (!o) setCalModal(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus size={16} className="text-deep-violet" />
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
                      calColor === c.value ? "ring-2 ring-offset-2 ring-midnight-charcoal scale-110" : "opacity-60 hover:opacity-100"
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
