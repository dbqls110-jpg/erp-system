"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";

/**
 * 카카오 지도에 공간 위치를 찍는다.
 *
 * 키가 없거나 SDK 를 못 불러와도 화면이 깨지지 않아야 한다. 지도는 표를 돕는
 * 부가 정보이고, 답변의 알맹이는 표 쪽에 있기 때문이다. 그래서 실패하면
 * 이유를 적은 자리표시자로 떨어진다.
 */

export interface MapPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  note?: string;
}

/** 카카오 SDK 는 전역에 얹힌다. 필요한 부분만 좁게 선언한다. */
interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}
interface KakaoMapsNamespace {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => { extend(latlng: KakaoLatLng): void };
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number },
  ) => {
    setBounds(bounds: object): void;
    setCenter(latlng: KakaoLatLng): void;
    setLevel(level: number): void;
  };
  Marker: new (options: { position: KakaoLatLng; title?: string }) => {
    setMap(map: object | null): void;
  };
}
declare global {
  interface Window {
    kakao?: { maps?: KakaoMapsNamespace };
  }
}

const SDK_ID = "kakao-maps-sdk";

/** SDK 를 한 번만 주입한다. 여러 지도가 동시에 떠도 script 태그는 하나다. */
function loadKakaoSdk(appKey: string): Promise<KakaoMapsNamespace> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      window.kakao.maps.load(() => resolve(window.kakao!.maps!));
      return;
    }

    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    const onLoad = () => {
      if (!window.kakao?.maps) {
        reject(new Error("SDK 를 불러왔지만 kakao.maps 가 없습니다."));
        return;
      }
      // autoload=false 로 받았으므로 여기서 명시적으로 초기화한다.
      window.kakao.maps.load(() => resolve(window.kakao!.maps!));
    };

    script.addEventListener("load", onLoad);
    script.addEventListener("error", () =>
      reject(new Error("카카오 지도 SDK 를 불러오지 못했습니다. 도메인 등록을 확인하세요.")),
    );

    if (!existing) {
      script.id = SDK_ID;
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
      document.head.appendChild(script);
    } else if (existing.dataset.loaded === "true") {
      onLoad();
    }
  });
}

function Placeholder({ message }: { message: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 text-center">
      <MapPin className="size-5 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

export function VenueMap({ pins, height = 240 }: { pins: MapPin[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

  // 매 렌더마다 새 배열을 만들면 아래 useEffect 의 의존성이 계속 바뀌어
  // 지도를 무한히 다시 그린다. 좌표가 실제로 바뀔 때만 갱신되게 묶는다.
  const pinKey = pins.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|");
  const usablePins = useMemo(
    () => pins.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    // pinKey 가 좌표 변화를 대표한다. pins 배열 자체는 매번 새 참조라 쓸 수 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pinKey],
  );

  useEffect(() => {
    if (!appKey || usablePins.length === 0) return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    async function draw() {
      try {
        const maps = await loadKakaoSdk(appKey!);
        if (cancelled || !container) return;

        const first = usablePins[0];
        const map = new maps.Map(container, {
          center: new maps.LatLng(first.lat, first.lng),
          level: 7,
        });

        const bounds = new maps.LatLngBounds();
        for (const pin of usablePins) {
          const position = new maps.LatLng(pin.lat, pin.lng);
          new maps.Marker({ position, title: pin.name }).setMap(map);
          bounds.extend(position);
        }

        // 핀이 하나뿐이면 bounds 를 쓰면 지나치게 확대된다.
        if (usablePins.length > 1) map.setBounds(bounds);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "지도를 표시하지 못했습니다.");
        }
      }
    }

    void draw();
    return () => {
      cancelled = true;
    };
  }, [appKey, usablePins]);

  if (!appKey) {
    return <Placeholder message="지도 키가 설정되지 않아 위치를 표시할 수 없습니다." />;
  }
  if (usablePins.length === 0) {
    return <Placeholder message="좌표가 있는 항목이 없어 지도를 표시하지 않았습니다." />;
  }
  if (error) {
    return <Placeholder message={error} />;
  }

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full overflow-hidden rounded-xl border border-border"
      aria-label={`공간 위치 지도, 핀 ${usablePins.length}개`}
    />
  );
}
