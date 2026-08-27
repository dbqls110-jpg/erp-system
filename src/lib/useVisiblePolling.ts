"use client";

import { useEffect, useRef } from "react";

/** 새벽 2시~오전 8시 (respectQuietHours 옵션을 켠 경우에만 사용됨) */
export function isQuietHours() {
  const h = new Date().getHours();
  return h >= 2 && h < 8;
}

interface Options {
  /**
   * 마운트 시 1회 즉시 실행할지 여부. 기본 true.
   * 이 1회는 사용자가 화면을 연 시점이므로 가시성/새벽시간 제한을 받지 않는다.
   */
  immediate?: boolean;
  /**
   * 이 값이 바뀌면 즉시 1회 다시 실행한다. 조회 대상이 바뀔 때 쓴다(예: agentType).
   * **반드시 원시값을 넘길 것.** 객체나 함수를 넘기면 매 렌더마다 재실행된다.
   */
  refreshKey?: string | number | boolean | null;
  /**
   * 새벽 2~8시에 주기 폴링을 멈출지 여부. 기본 false.
   *
   * 가시성 게이팅만으로 "아무도 안 보는 탭이 DB를 깨우는" 문제는 이미 해결되므로
   * 보통은 불필요하다. 탭이 보인다는 건 사용자가 실제로 화면 앞에 있다는 뜻이라,
   * 이 옵션을 켜면 야근/시차 근무자에게는 화면이 멈춘 것처럼 보인다.
   */
  respectQuietHours?: boolean;
}

/**
 * 탭이 보이는 동안에만 콜백을 주기 실행한다.
 *
 * 백그라운드 탭에서 폴링이 계속 돌면 아무도 안 보는 사이 DB가 하루 종일 깨어 있게 되어
 * 무료 플랜 컴퓨트 시간을 소진한다(Neon 소진 사고의 원인). 탭이 다시 보이면 즉시 한 번
 * 실행해 최대 intervalMs 만큼 낡은 값을 보는 일이 없게 한다.
 *
 * callback 은 ref 로 보관하므로 **메모이즈하지 않은 인라인 함수를 넘겨도 안전하다.**
 * 콜백 identity 변화로는 재실행되지 않는다. 조회 대상이 바뀌어 즉시 다시 불러야 하면
 * refreshKey 에 그 대상을 나타내는 원시값을 넘길 것.
 */
export function useVisiblePolling(
  callback: () => void,
  intervalMs: number,
  { immediate = true, refreshKey = null, respectQuietHours = false }: Options = {},
) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 화면을 연 시점의 1회 실행. refreshKey 가 바뀌면 다시 실행한다.
  // callback 을 deps 에 넣지 않는 것이 중요하다 — 넣으면 메모이즈 안 된 콜백을 받았을 때
  // 매 렌더마다 재실행되어 무한 요청 루프가 된다.
  useEffect(() => {
    if (immediate) callbackRef.current();
  }, [immediate, refreshKey]);

  // 주기 폴링: 탭이 보일 때만.
  useEffect(() => {
    const run = () => {
      if (document.visibilityState !== "visible") return;
      if (respectQuietHours && isQuietHours()) return;
      callbackRef.current();
    };

    const id = setInterval(run, intervalMs);
    // 탭으로 돌아오는 순간에도 한 번 갱신
    document.addEventListener("visibilitychange", run);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", run);
    };
  }, [intervalMs, respectQuietHours]);
}
