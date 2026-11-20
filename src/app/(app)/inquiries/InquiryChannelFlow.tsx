"use client";

import { useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import styles from "./inbox.module.css";

export type InquiryFlowChannel = {
  name: string;
  icon: LucideIcon;
  connection: { kind: "connected"; filter: string; count: number } | { kind: "disconnected" | "loading" | "unavailable" };
};

export function InquiryChannelFlow({ channels, selectedFilter, total, preview, onSelect, onPreview }: {
  channels: readonly InquiryFlowChannel[];
  selectedFilter: string;
  total: number;
  preview: readonly { key: string; name: string }[];
  onSelect: (filter: string) => void;
  onPreview: (key: string) => void;
}) {
  const [motion, setMotion] = useState<{ lane: number; sequence: number } | null>(null);
  const height = Math.max(30, channels.length * 36 - 6);
  const center = height / 2;
  const diagramStyle: CSSProperties & { "--flow-height": string } = { "--flow-height": `${height}px` };
  const inbound = (lane: number) => `M 0 ${15 + lane * 36} C 250 ${15 + lane * 36}, 350 ${center}, 500 ${center}`;
  function selectChannel(filter: string, lane: number) {
    onSelect(filter);
    if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 767px)").matches) {
      setMotion(null);
      return;
    }
    setMotion(previous => ({ lane, sequence: (previous?.sequence ?? 0) + 1 }));
  }
  return <figure className={styles.flow} aria-label="실제 문의 채널 연결 상태">
    <figcaption>채널별 조회 목록 <span>{channels.some(item => item.connection.kind === "loading") ? "연결 상태 확인 중" : `${channels.filter(item => item.connection.kind === "connected").length}개 채널 연결`} · 읽어도 목록 건수는 유지됩니다</span></figcaption>
    <div className={styles.diagram} style={diagramStyle}>
      <svg className={styles.wires} viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.2">
          {channels.map((item, lane) => <path key={item.name} d={inbound(lane)} />)}
          <path d={`M 500 ${center} L 1000 ${center}`} />
        </g>
        {motion && <g key={motion.sequence} fill="none" className={styles.flowMotion}>
          <path d={inbound(motion.lane)} pathLength="1" className={styles.inboundPulse} />
          <path d={`M 500 ${center} L 1000 ${center}`} pathLength="1" className={styles.outboundPulse} onAnimationEnd={() => setMotion(null)} />
        </g>}
      </svg>
      <div className={styles.channels}>{channels.map((item, lane) => {
        const connection = item.connection;
        return <button key={item.name} type="button" aria-pressed={connection.kind === "connected" ? selectedFilter === connection.filter : undefined} disabled={connection.kind !== "connected"} onClick={() => { if (connection.kind === "connected") selectChannel(connection.filter, lane); }} className={connection.kind !== "connected" ? styles.disconnected : undefined}>
          <item.icon size={14} aria-hidden="true" /><span>{item.name}</span><small>{connection.kind === "connected" ? `전체 ${connection.count}건` : connection.kind === "loading" ? "연결 확인 중" : connection.kind === "unavailable" ? "조회 실패" : "미연결"}</small><i aria-hidden="true" />
        </button>;
      })}</div>
      <button type="button" className={styles.hub} onClick={() => { setMotion(null); onSelect("all"); }} aria-label="전체 채널 문의 보기"><strong>ERP</strong><span>문의 통합</span></button>
      <div className={styles.flowPreview}><span>통합함 · {total}건</span>{preview.map(item => <button type="button" key={item.key} onClick={() => onPreview(item.key)} title={item.name}>{item.name}</button>)}{total === 0 && <p>새 문의를 기다립니다</p>}</div>
    </div>
    <p className={styles.flowHint}>채널을 누르면 해당 목록으로 전환합니다. 모션은 선택 흐름 안내이며 실제 전송 상태가 아닙니다.</p>
  </figure>;
}
