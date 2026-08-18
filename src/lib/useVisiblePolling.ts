"use client";

import { useEffect, useRef } from "react";

/** 새벽 2시~오전 8시: 폴링 완전 중단 (DB 무료 한도 절약) */
export function isQuietHours() {
  const h = new Date().getHours();
  return h >= 2 && h < 8;
}

interface Options {
  /**
   * 마운트 시(그리고 callback 이 바뀔 때) 1회 즉시 실행할지 여부. 기본 true.
   * 이 1회는 사용자가 화면을 연 시점이므로 가시성/새벽시간 제한을 받지 않는다.
   */
  immediate?: boolean;
  /** 새벽 시간대에 주기 폴링을 멈출지 여부. 기본 true. */
  respectQuietHours?: boolean;
}

/**
 * 탭이 보이는 동안에만 콜백을 주기 실행한다.
 *
 * 백그라운드 탭에서 폴링이 계속 돌면 아무도 안 보는 사이 DB가 하루 종일 깨어 있게 되어
 * 무료 플랜 컴퓨트 시간을 소진한다(Neon 소진 사고의 원인). 탭이 다시 보이면 즉시 한 번
 * 실행해 최대 intervalMs 만큼 낡은 값을 보는 일이 없게 한다.
 */
export function useVisiblePolling(
  callback: () => void,
  intervalMs: number,
  { immediate = true, respectQuietHours = true }: Options = {},
) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 화면을 연 시점의 1회 실행. 조회 대상(callback)이 바뀌면 다시 실행한다.
  useEffect(() => {
    if (immediate) callback();
  }, [callback, immediate]);

  // 주기 폴링: 탭이 보이고 새벽 시간대가 아닐 때만.
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
