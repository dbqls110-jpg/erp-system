"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageCircle, ArrowLeft } from "lucide-react";
import { sendMessage } from "@/app/actions/message";
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

export function MessengerView({ myId, users }: { myId: string; users: User[] }) {
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showList, setShowList] = useState(true); // mobile: show list or chat
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    const id = setInterval(fetchConversations, 10000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedConvId) return;
    fetchMessages(selectedConvId);
    const id = setInterval(() => fetchMessages(selectedConvId), 3000);
    return () => clearInterval(id);
  }, [selectedConvId, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      await fetchConversations();
      // find or set conv id after sending
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

  // 직원 목록 (대화 있는 사람 위, 나머지 아래)
  const convUserIds = new Set(conversations.map(c => c.other.id));
  const recentUsers = conversations.map(c => c.other);
  const otherUsers = users.filter(u => !convUserIds.has(u.id));
  const allUsers = [...recentUsers, ...otherUsers];

  return (
    <div className="flex h-full bg-canvas-white">
      {/* 왼쪽 패널: 직원 목록 */}
      <div className={cn(
        "w-full sm:w-72 shrink-0 border-r border-ash-gray flex flex-col",
        !showList && "hidden sm:flex"
      )}>
        <div className="h-14 px-4 flex items-center border-b border-ash-gray shrink-0">
          <MessageCircle size={16} className="text-deep-violet mr-2" />
          <h2 className="text-sm font-semibold text-deep-space-charcoal">메신저</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {allUsers.length === 0 && (
            <p className="text-sm text-smoke-gray px-4 py-6">다른 직원이 없습니다.</p>
          )}
          {/* 최근 대화 */}
          {recentUsers.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-smoke-gray uppercase tracking-wider px-4 pt-3 pb-1">최근 대화</p>
              {conversations.map((conv) => (
                <button
                  key={conv.conversationId}
                  onClick={() => selectUser(conv.other)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 hover:bg-hint-of-sky/50 transition-colors text-left",
                    selectedUser?.id === conv.other.id && "bg-accent"
                  )}
                >
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
          {/* 전체 직원 */}
          {otherUsers.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-smoke-gray uppercase tracking-wider px-4 pt-3 pb-1">전체 직원</p>
              {otherUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => selectUser(user)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 hover:bg-hint-of-sky/50 transition-colors text-left",
                    selectedUser?.id === user.id && "bg-accent"
                  )}
                >
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

      {/* 오른쪽 패널: 채팅 */}
      <div className={cn(
        "flex-1 flex flex-col",
        showList && "hidden sm:flex"
      )}>
        {!selectedUser ? (
          <div className="flex-1 flex flex-col items-center justify-center text-smoke-gray gap-2">
            <MessageCircle size={40} className="opacity-30" />
            <p className="text-sm">왼쪽에서 직원을 선택하세요</p>
          </div>
        ) : (
          <>
            {/* 채팅 헤더 */}
            <div className="h-14 px-4 flex items-center gap-3 border-b border-ash-gray shrink-0">
              <button onClick={() => setShowList(true)} className="sm:hidden text-smoke-gray hover:text-midnight-charcoal mr-1">
                <ArrowLeft size={18} />
              </button>
              <Avatar className="h-8 w-8">
                <AvatarImage src={selectedUser.image ?? undefined} />
                <AvatarFallback className="text-xs bg-hint-of-sky">{initials(selectedUser.name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-semibold text-deep-space-charcoal">{selectedUser.name}</span>
            </div>

            {/* 메시지 목록 */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-xs text-smoke-gray text-center py-8">아직 메시지가 없습니다. 첫 메시지를 보내보세요!</p>
              )}
              {messages.map((msg) => {
                const isMine = msg.senderId === myId;
                return (
                  <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                    {!isMine && (
                      <Avatar className="h-6 w-6 mr-2 shrink-0 mt-0.5">
                        <AvatarImage src={selectedUser.image ?? undefined} />
                        <AvatarFallback className="text-[9px] bg-hint-of-sky">{initials(selectedUser.name)}</AvatarFallback>
                      </Avatar>
                    )}
                    <div className={cn("max-w-[70%] space-y-0.5", isMine && "items-end flex flex-col")}>
                      <div className={cn(
                        "px-3 py-2 rounded-2xl text-sm leading-relaxed",
                        isMine
                          ? "bg-deep-violet text-white rounded-tr-sm"
                          : "bg-hint-of-sky text-midnight-charcoal rounded-tl-sm"
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

            {/* 입력창 */}
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
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="bg-deep-violet hover:bg-deep-violet/90 text-white shrink-0"
                  style={{ borderRadius: "9px" }}
                >
                  <Send size={15} />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
