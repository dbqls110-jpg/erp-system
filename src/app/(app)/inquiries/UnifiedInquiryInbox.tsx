"use client";

import { useMemo, useRef, useState } from "react";
import { Globe, Mail, MessageCircle, Phone, Search, Smartphone, ShieldCheck, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildInquiryInbox, mailToInboxItem, maskInquiryBody, maskInquiryContact, summarizeInquiryInbox, type InquiryBranch, type InquiryInboxSources } from "@/lib/inquiryInbox";
import { loadPrivateInboxAction } from "@/app/actions/privateInbox";
import { type PrivateInboxView } from "@/lib/privateInboxPolicy";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import { InboxMailSettings } from "./InboxMailSettings";
import { InboxFollowUpForm } from "./InboxFollowUpForm";
import styles from "./inbox.module.css";

const EMPTY_INBOX: PrivateInboxView = { mailboxes: [], messages: [], followUps: [] };
const PAGE_SIZE = 20;
function dateText(value: number | null) {
  return value === null ? "날짜 미정" : new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function UnifiedInquiryInbox({ inquiries, registrations, rentals, onOpenBoard }: InquiryInboxSources & { onOpenBoard: (branch: InquiryBranch) => void }) {
  const website = useMemo(() => buildInquiryInbox({ inquiries, registrations, rentals }), [inquiries, registrations, rentals]);
  const [privateInbox, setPrivateInbox] = useState(EMPTY_INBOX);
  const [mailError, setMailError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [masked, setMasked] = useState(true), [query, setQuery] = useState(""), [channel, setChannel] = useState("all"), [page, setPage] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  useVisiblePolling(async () => {
    setNow(new Date());
    try { setPrivateInbox(await loadPrivateInboxAction()); setMailError(""); }
    catch { setMailError("내 메일·연락 일정을 불러오지 못했습니다. 다시 불러오거나 관리자에게 문의해 주세요. 홈페이지 문의는 계속 확인할 수 있습니다."); }
  }, 60_000);
  const items = useMemo(() => [...website, ...privateInbox.messages.map(mailToInboxItem)].sort((a, b) => (b.receivedTime ?? -Infinity) - (a.receivedTime ?? -Infinity) || a.key.localeCompare(b.key)), [website, privateInbox.messages]);
  const followUps = new Map(privateInbox.followUps.map(item => [item.itemKey, item]));
  const summary = summarizeInquiryInbox(items, now);
  const active = items.filter(item => !item.completed);
  const missing = active.filter(item => !followUps.get(item.key)?.dueAt).length;
  const scheduled = items.filter(item => followUps.get(item.key)?.dueAt).length;
  const needle = query.trim().toLocaleLowerCase("ko-KR");
  const filtered = items.filter(item => (channel === "all" || (channel === "website" ? item.branch !== "mail" : item.branch === "mail" && item.category === channel)) && (!needle || [item.title, item.name, item.email, item.phone, item.body, item.assignee].some(value => value.toLocaleLowerCase("ko-KR").includes(needle))));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), currentPage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selected = rows.find(item => item.key === selectedKey) ?? rows[0] ?? null;
  const contact = (value: string) => masked ? maskInquiryContact(value) : value || "미입력";
  const setFilter = (value: string) => { setChannel(value); setPage(0); };
  const selectItem = (key: string) => {
    setSelectedKey(key);
    if (window.matchMedia("(max-width: 1199px)").matches) {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView({ block: "start" });
    }
  };
  const channels = [
    { name: "홈페이지", filter: "website", icon: Globe, connected: true, count: website.length },
    { name: "Gmail", filter: "Gmail", icon: Mail, connected: privateInbox.mailboxes.some(item => item.provider === "gmail"), count: privateInbox.messages.filter(item => item.provider === "gmail").length },
    { name: "네이버", filter: "네이버", icon: Mail, connected: privateInbox.mailboxes.some(item => item.provider === "naver"), count: privateInbox.messages.filter(item => item.provider === "naver").length },
    { name: "카카오톡", icon: MessageCircle, connected: false, count: 0 },
    { name: "문자", icon: Smartphone, connected: false, count: 0 },
    { name: "전화", icon: Phone, connected: false, count: 0 },
  ];
  return <section aria-label="통합 문의함" className={styles.inbox}>
    <header className={styles.toolbar}>
      <div><h2>문의 통합</h2><p>홈페이지와 내 메일을 한곳에서 확인하고 다음 연락을 기록합니다.</p></div>
      <label className={styles.privacy}><ShieldCheck size={15} aria-hidden="true" /><span>이름·번호 가리기</span><input type="checkbox" role="switch" checked={masked} onChange={event => setMasked(event.target.checked)} aria-label="이름·연락처 가리기" /></label>
    </header>
    <InboxMailSettings data={privateInbox} onChange={setPrivateInbox} />
    {mailError && <p role="alert" className={styles.error}>{mailError} <button type="button" className="underline" onClick={async () => { try { setPrivateInbox(await loadPrivateInboxAction()); setMailError(""); } catch { /* 기존 오류 안내 유지 */ } }}>다시 불러오기</button></p>}
    <div className={styles.workspace}>
      <div className={styles.main}>
        <dl className={styles.metrics}>
          {[{ label: "최근 10일 접수", value: summary.recent, hint: "홈페이지 + 내 메일" }, { label: "초기 처리 대기", value: summary.waiting, hint: "홈페이지 문의 기준" }, { label: "다음 연락 미정", value: missing, hint: "종료되지 않은 건", alert: true }, { label: "저장한 연락 일정", value: scheduled, hint: "내가 직접 지정한 일정" }].map(item => <div key={item.label} className={item.alert ? styles.attention : undefined}><dt>{item.label}</dt><dd>{item.value}<span>건</span></dd><p>{item.hint}</p></div>)}
        </dl>
        <figure className={styles.flow} aria-label="실제 문의 채널 연결 상태">
          <figcaption>연결한 채널에서 들어온 문의를 모으는 화면 <span>{channels.filter(item => item.connected).length}개 채널 연결 · 메일은 본인만</span></figcaption>
          <div className={styles.diagram}>
            <svg className={styles.wires} viewBox="0 0 720 220" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.2">{[22, 57, 92, 127, 162, 197].map(y => <path key={y} d={`M 174 ${y} C 300 ${y}, 295 110, 369 110`} />)}<path d="M 435 110 L 550 110" /></g></svg>
            <div className={styles.channels}>{channels.map(item => <button key={item.name} type="button" aria-pressed={item.filter ? channel === item.filter : undefined} disabled={!item.connected} onClick={() => item.filter && setFilter(item.filter)} className={!item.connected ? styles.disconnected : undefined}><item.icon size={14} aria-hidden="true" /><span>{item.name}</span><small>{item.connected ? `${item.count}건` : "미연결"}</small><i aria-hidden="true" /></button>)}</div>
            <button type="button" className={styles.hub} onClick={() => setFilter("all")} aria-label="전체 채널 문의 보기"><strong>ERP</strong><span>문의 통합</span></button>
            <div className={styles.flowPreview}><span>통합함 · {items.length}건</span>{items.slice(0, 4).map(item => <button type="button" key={item.key} onClick={() => { setFilter("all"); setSelectedKey(item.key); }}>{contact(item.name)}</button>)}{items.length === 0 && <p>새 문의를 기다립니다</p>}</div>
          </div>
        </figure>
        <div className={styles.list}>
          <div className={styles.filters}>
            <label className={styles.search}><Search size={15} aria-hidden="true" /><input type="search" aria-label="문의 검색" placeholder="제목·상대·원문 검색" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
            <select aria-label="문의 채널" value={channel} onChange={event => setFilter(event.target.value)}><option value="all">전체 채널</option><option value="website">홈페이지</option><option value="Gmail">Gmail</option><option value="네이버">네이버</option></select>
            <span role="status">{filtered.length}건 · 최신순</span>
          </div>
          <div className={styles.tableWrap}><table><caption className="sr-only">통합 문의 목록. 상대를 누르면 오른쪽에서 원문과 연락 일정을 확인합니다.</caption><thead><tr><th scope="col">시각</th><th scope="col">채널</th><th scope="col">상대 · 제목</th><th scope="col">원문 미리보기</th><th scope="col">상태</th><th scope="col">다음 연락</th></tr></thead><tbody>{rows.map(item => {
            const due = followUps.get(item.key)?.dueAt;
            return <tr key={item.key} className={item.key === selected?.key ? styles.selected : undefined}>
              <td className={styles.date}>{dateText(item.receivedTime)}</td><td><span className={styles.channelTag}>{item.branch === "mail" ? <Mail size={11} /> : <Globe size={11} />}{item.branch === "mail" ? item.category : "홈페이지"}</span></td>
              <td><button type="button" className={styles.rowButton} onClick={() => selectItem(item.key)} aria-pressed={item.key === selected?.key} aria-controls="unified-inquiry-detail"><strong>{contact(item.name)}</strong><span>{item.title}</span></button></td>
              <td><p className={styles.excerpt}>{(masked ? maskInquiryBody(item) : item.body) || "원문 없음"}</p></td><td><span className={styles.status}>{item.status}</span></td>
              <td className={due ? styles.scheduled : styles.unset}>{due ? dateText(new Date(due).getTime()) : "미정"}</td>
            </tr>;
          })}</tbody></table></div>
          <ul className={styles.mobileList} aria-label="통합 문의 모바일 목록">{rows.map(item => <li key={item.key}><button type="button" onClick={() => selectItem(item.key)} aria-controls="unified-inquiry-detail" aria-pressed={item.key === selected?.key}><span className={styles.mobileRowTop}>{contact(item.name)}<small>{item.category} · {dateText(item.receivedTime)}</small></span><strong>{item.title}</strong><span>{(masked ? maskInquiryBody(item) : item.body).slice(0, 80)}</span></button></li>)}</ul>
          {rows.length === 0 && <p className={styles.empty}>{items.length ? "검색 조건에 맞는 문의가 없습니다." : "새 문의가 들어오면 이곳에 표시됩니다. 내 메일은 연결 후 수신 버튼으로 가져오세요."}</p>}
          <footer className={styles.pagination}><span>{currentPage + 1} / {pageCount} 페이지</span><div><Button variant="ghost" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</Button><Button variant="ghost" size="sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>다음</Button></div></footer>
        </div>
      </div>
      <section ref={detailRef} tabIndex={-1} id="unified-inquiry-detail" aria-label="선택한 문의 원문" className={styles.detail}>
        {selected ? <>
          <h3>{selected.title}</h3><p className={styles.detailMeta}><span>{selected.category}</span><span>{selected.status}</span><time>{dateText(selected.receivedTime)}</time></p>
          <dl><dt>상대</dt><dd>{contact(selected.name)}</dd><dt>연락처</dt><dd>{contact(selected.email)}{selected.phone ? ` · ${contact(selected.phone)}` : ""}</dd></dl>
          <h4>원문</h4><p className={styles.original}>{(masked ? maskInquiryBody(selected) : selected.body) || "등록된 원문이 없습니다."}</p>
          <InboxFollowUpForm key={`${selected.key}:${followUps.get(selected.key)?.version ?? 0}`} itemKey={selected.key} value={followUps.get(selected.key)} onChange={setPrivateInbox} />
          {selected.branch !== "mail" && <Button type="button" variant="outline" className="mt-5 w-full" onClick={() => { if (selected.branch !== "mail") onOpenBoard(selected.branch); }}>해당 문의 보드에서 관리</Button>}
          <p className={styles.detailFoot}>{selected.branch === "mail" ? "내가 연결한 메일 · 본인만 조회" : "홈페이지 문의 · 기존 담당자와 공유"}<br />알려진 이름·연락처만 가립니다. 원문에 별도로 적힌 개인정보는 확인해 주세요. 목록 조회로 원본 메일을 읽음 처리하지 않습니다.</p>
        </> : <div className={styles.empty}><CalendarClock size={24} aria-hidden="true" /><p>문의가 접수되면 원문과 다음 연락 일정을 확인할 수 있습니다.</p></div>}
      </section>
    </div>
  </section>;
}
