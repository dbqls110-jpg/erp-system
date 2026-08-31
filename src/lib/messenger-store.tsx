"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVisiblePolling } from "@/lib/useVisiblePolling";

export interface MessengerUser {
  id: string;
  name: string | null;
  image: string | null;
  role?: string;
}

export interface ConvItem {
  conversationId: string;
  other: MessengerUser;
  lastMsg: {
    content: string;
    senderId: string;
    createdAt: string;
    attachmentName?: string | null;
  } | null;
  unread: number;
}

interface MessengerContextValue {
  conversations: ConvItem[];
  /** 전체 미읽음 합계. 헤더 배지와 위젯 배지가 같은 값을 쓴다. */
  unreadTotal: number;
  /** 대화 목록을 즉시 다시 가져온다. 메시지 전송 직후처럼 폴링을 기다릴 수 없을 때 쓴다. */
  refresh: () => Promise<void>;

  /** 직원 목록. 위젯을 처음 열 때 지연 로딩된다. */
  users: MessengerUser[];
  loadUsers: () => void;

  /** 우하단 플로팅 위젯 상태 */
  dockOpen: boolean;
  setDockOpen: (open: boolean) => void;
  /** 위젯에서 ERP 비서 대화를 열고 있는지. 사람 대화와 배타적이다. */
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  /** 특정 상대와의 대화를 위젯에서 연다. 다른 화면에서 "메시지 보내기"로 진입할 때 쓴다. */
  openDockWith: (user: MessengerUser) => void;
  dockTarget: MessengerUser | null;
  setDockTarget: (user: MessengerUser | null) => void;
}

const MessengerContext = createContext<MessengerContextValue | null>(null);

/**
 * 메신저 대화 목록을 한 곳에서만 폴링한다.
 *
 * 예전에는 헤더가 /unread 를, 메신저 페이지가 /conversations 를 각각 30초마다
 * 따로 호출했다. 여기에 플로팅 위젯까지 자기 폴링을 돌리면 폴러가 셋이 된다.
 * 예전에 DB 연결을 고갈시킨 것이 바로 이 구조였다.
 *
 * /conversations 응답에 대화별 미읽음 수가 이미 들어 있으므로 합계로 헤더 배지를
 * 만들 수 있다. 즉 위젯을 추가하면서 오히려 요청 수가 줄어든다.
 */
export function MessengerProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [users, setUsers] = useState<MessengerUser[]>([]);
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTarget, setDockTarget] = useState<MessengerUser | null>(null);
  const [assistantOpen, setAssistantOpenState] = useState(false);
  const usersLoaded = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/messenger/conversations");
      if (res.ok) setConversations(await res.json());
    } catch {
      // 네트워크 오류는 조용히 넘긴다. 다음 폴링에서 회복된다.
    }
  }, []);

  // 탭이 보이는 동안에만 폴링한다. 새벽 시간대 차단(respectQuietHours)은 쓰지 않는다 —
  // 탭이 보인다는 건 사람이 실제로 앞에 있다는 뜻이고, 야간 행사 대응 중에 메신저가
  // 멈춘 것처럼 보이는 편이 더 나쁘다. 헤더도 같은 이유로 이 옵션을 쓰지 않는다.
  useVisiblePolling(refresh, 30000);

  const loadUsers = useCallback(() => {
    if (usersLoaded.current) return;
    usersLoaded.current = true;
    fetch("/api/messenger/users")
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers)
      .catch(() => {
        // 실패하면 다음 열기에서 다시 시도할 수 있게 되돌린다.
        usersLoaded.current = false;
      });
  }, []);

  const setAssistantOpen = useCallback((open: boolean) => {
    setAssistantOpenState(open);
    if (open) setDockTarget(null);
  }, []);

  const openDockWith = useCallback(
    (user: MessengerUser) => {
      setAssistantOpenState(false);
      setDockTarget(user);
      setDockOpen(true);
      loadUsers();
    },
    [loadUsers],
  );

  const unreadTotal = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread, 0),
    [conversations],
  );

  const value = useMemo(
    () => ({
      conversations,
      unreadTotal,
      refresh,
      users,
      loadUsers,
      dockOpen,
      setDockOpen,
      assistantOpen,
      setAssistantOpen,
      openDockWith,
      dockTarget,
      setDockTarget,
    }),
    [
      conversations,
      unreadTotal,
      refresh,
      users,
      loadUsers,
      dockOpen,
      assistantOpen,
      setAssistantOpen,
      openDockWith,
      dockTarget,
    ],
  );

  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
}

/**
 * Provider 밖에서 부르면 던진다. 조용히 빈 값을 돌려주면 배지가 항상 0 으로
 * 보이는 식으로 증상 없이 망가지므로, 차라리 빌드/개발 중에 터지는 편이 낫다.
 */
export function useMessenger(): MessengerContextValue {
  const ctx = useContext(MessengerContext);
  if (!ctx) throw new Error("useMessenger 는 MessengerProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}
