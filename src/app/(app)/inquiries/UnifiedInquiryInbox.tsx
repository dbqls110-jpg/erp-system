"use client";

import { useMemo, useRef, useState } from "react";
import { Globe, Mail, MessageCircle, Phone, Search, Smartphone, ShieldCheck, CalendarClock, ChevronLeft, CheckCheck, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildInquiryInbox, mailToInboxItem, maskInquiryBody, maskInquiryContact, summarizeInquiryInbox, type InquiryBranch, type InquiryInboxSources } from "@/lib/inquiryInbox";
import { loadPrivateInboxAction, markMailboxReadAction } from "@/app/actions/privateInbox";
import { loadUnifiedInboxAction } from "@/app/actions/inquiryWorkspace";
import { projectContactToInboxItem, type ProjectContactView } from "@/lib/projectContactPolicy";
import { ProjectContactPanel } from "@/components/projects/ProjectContactPanel";
import { type PrivateInboxView } from "@/lib/privateInboxPolicy";
import { receiveInbox, failInbox, type PrivateInboxLoad } from "@/lib/privateInboxLoad";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import { InboxMailSettings } from "./InboxMailSettings";
import { InboxFollowUpForm } from "./InboxFollowUpForm";
import { InquiryChannelFlow, type InquiryFlowChannel } from "./InquiryChannelFlow";
import styles from "./inbox.module.css";

const EMPTY_INBOX: PrivateInboxView = { mailboxes: [], messages: [], followUps: [] };
const PAGE_SIZE = 20;
function dateText(value: number | null) {
  return value === null ? "날짜 미정" : new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function UnifiedInquiryInbox({ inquiries, registrations, rentals, onOpenBoard }: InquiryInboxSources & { onOpenBoard: (branch: InquiryBranch) => void }) {
  const website = useMemo(() => buildInquiryInbox({ inquiries, registrations, rentals }), [inquiries, registrations, rentals]);
  const [mailLoad, setMailLoad] = useState<PrivateInboxLoad>({ kind: "loading" });
  const privateInbox = (mailLoad.kind === "loading" ? null : mailLoad.data) ?? EMPTY_INBOX;
  const mailKnown = mailLoad.kind !== "loading" && mailLoad.data !== null;
  const [projectContacts, setProjectContacts] = useState<{ items: ProjectContactView[]; canEdit: boolean } | null>(null);
  const [projectError, setProjectError] = useState("");
  const mailError = mailLoad.kind === "failed" ? mailLoad.message : "";
  const [now, setNow] = useState(() => new Date());
  const [masked, setMasked] = useState(false), [query, setQuery] = useState(""), [channel, setChannel] = useState("all"), [page, setPage] = useState(0);
  const [checkedMails, setCheckedMails] = useState<Set<string>>(() => new Set());
  const [unreadOnly, setUnreadOnly] = useState(false), [readBusy, setReadBusy] = useState(false), [readMessage, setReadMessage] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingReads = useRef(new Set<string>());
  const reading = useRef(false);
  function receivePrivateInbox(data: PrivateInboxView) { setMailLoad(previous => receiveInbox(previous, data)); }
  useVisiblePolling(async () => {
    setNow(new Date());
    try {
      const result = await loadUnifiedInboxAction();
      if (result.mail.ok) receivePrivateInbox(result.mail.data); else setMailLoad(previous => failInbox(previous, result.mail.message ?? "메일 연결을 불러오지 못했습니다. 다시 시도해 주세요."));
      if (result.projects.ok) { setProjectContacts(result.projects.data); setProjectError(""); } else setProjectError(result.projects.message);
    }
    catch { setMailLoad(previous => failInbox(previous, "내 메일·연락 일정을 불러오지 못했습니다. 다시 불러오거나 관리자에게 문의해 주세요. 홈페이지 문의는 계속 확인할 수 있습니다.")); }
  }, 60_000);
  const items = useMemo(() => [...website, ...privateInbox.messages.map(mailToInboxItem), ...(projectContacts?.items ?? []).map(projectContactToInboxItem)].sort((a, b) => (b.receivedTime ?? -Infinity) - (a.receivedTime ?? -Infinity) || a.key.localeCompare(b.key)), [website, privateInbox.messages, projectContacts]);
  const followUps = new Map(privateInbox.followUps.map(item => [item.itemKey, item]));
  const projectByKey = new Map((projectContacts?.items ?? []).map(project => [`project:${project.id}`, project]));
  const nextContactAt = (key: string) => projectByKey.get(key)?.nextContactAt ?? followUps.get(key)?.dueAt;
  const summary = summarizeInquiryInbox(items, now);
  const active = website.filter(item => !item.completed);
  const missing = active.filter(item => !followUps.get(item.key)?.dueAt).length;
  const needle = query.trim().toLocaleLowerCase("ko-KR");
  const mailByKey = new Map(privateInbox.messages.map(mail => [`mail:${mail.id}`, mail]));
  const filtered = items.filter(item => (channel === "all" || (channel === "website" ? item.branch !== "mail" && item.branch !== "project" : channel === "project" ? item.branch === "project" : item.branch === "mail" && item.category === channel)) && (!unreadOnly || (item.branch === "mail" && !mailByKey.get(item.key)?.readAt)) && (!needle || [item.title, item.name, item.email, item.phone, item.body, item.assignee].some(value => value.toLocaleLowerCase("ko-KR").includes(needle))));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), currentPage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selected = rows.find(item => item.key === selectedKey) ?? rows[0] ?? null;
  const selectedProject = selected ? projectByKey.get(selected.key) : undefined;
  const contact = (value: string) => masked ? maskInquiryContact(value) : value || "미입력";
  const setFilter = (value: string) => { setChannel(value); setPage(0); setCheckedMails(new Set()); };
  const selectedMails = privateInbox.messages.filter(mail => checkedMails.has(mail.id));
  const pageMailIds = rows.flatMap(item => { const mail = mailByKey.get(item.key); return mail ? [mail.id] : []; });
  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    for (const id of ids) pendingReads.current.add(id);
    if (reading.current) return;
    reading.current = true;
    setReadBusy(true); setReadMessage("");
    const confirmed = new Set<string>();
    let failed = false;
    try {
      while (pendingReads.current.size) {
        const batch = [...pendingReads.current]; pendingReads.current.clear();
        try {
          const result = await markMailboxReadAction(batch);
          if (!result.ok) { failed = true; continue; }
          receivePrivateInbox(result.data);
          for (const id of batch) confirmed.add(id);
          setCheckedMails(previous => new Set([...previous].filter(id => !confirmed.has(id))));
        } catch { failed = true; }
      }
      setReadMessage(failed ? "일부 메일의 확인 처리를 저장하지 못했습니다. 새로고침 후 다시 확인해 주세요." : `${confirmed.size}건을 ERP에서 확인 처리했습니다. 원본 메일은 변경하지 않았습니다.`);
    } finally { reading.current = false; setReadBusy(false); }
  }
  function checkMail(id: string, checked: boolean) { setCheckedMails(previous => { const next = new Set(previous); if (checked) next.add(id); else next.delete(id); return next; }); }
  const selectItem = (key: string) => {
    setSelectedKey(key);
    const mail = mailByKey.get(key);
    if (mail && !mail.readAt) void markRead([mail.id]);
    if (window.matchMedia("(max-width: 1199px)").matches) {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView({ block: "start" });
    }
  };
  const mailConnection = (provider: "gmail" | "naver", filter: string): InquiryFlowChannel["connection"] => !mailKnown
    ? { kind: mailLoad.kind === "loading" ? "loading" : "unavailable" }
    : privateInbox.mailboxes.some(item => item.provider === provider)
      ? { kind: "connected", filter, count: privateInbox.messages.filter(item => item.provider === provider).length }
      : { kind: "disconnected" };
  const channels: InquiryFlowChannel[] = [
    { name: "홈페이지", icon: Globe, connection: { kind: "connected", filter: "website", count: website.length } },
    { name: "Gmail", icon: Mail, connection: mailConnection("gmail", "Gmail") },
    { name: "네이버", icon: Mail, connection: mailConnection("naver", "네이버") },
    { name: "프로젝트", icon: FolderKanban, connection: projectContacts ? { kind: "connected", filter: "project", count: projectContacts.items.length } : { kind: projectError ? "unavailable" : "loading" } },
    { name: "카카오톡", icon: MessageCircle, connection: { kind: "disconnected" } },
    { name: "문자", icon: Smartphone, connection: { kind: "disconnected" } },
    { name: "전화", icon: Phone, connection: { kind: "disconnected" } },
  ];
  return <section aria-label="통합 문의함" className={styles.inbox}>
    <header className={styles.toolbar}>
      <div><h2>문의 통합</h2><p>홈페이지·내 메일·프로젝트의 연락 상태와 다음 연락을 확인합니다.</p></div>
      <label className={styles.privacy}><ShieldCheck size={15} aria-hidden="true" /><span>이름·번호 가리기</span><input type="checkbox" role="switch" checked={masked} onChange={event => setMasked(event.target.checked)} aria-label="이름·연락처 가리기" /></label>
    </header>
    <InboxMailSettings data={mailKnown ? privateInbox : null} loadState={mailLoad.kind} onChange={receivePrivateInbox} />
    {mailError && <p role="alert" className={styles.error}>{mailError} <button type="button" className="underline" onClick={async () => { try { receivePrivateInbox(await loadPrivateInboxAction()); } catch { /* 기존 오류 안내 유지 */ } }}>다시 불러오기</button></p>}
    {projectError && <p role="status" className={styles.error}>{projectError}</p>}
    <div className={styles.workspace}>
      <div className={styles.main}>
        <dl className={styles.metrics}>
          {[{ label: "최근 10일 등록·연락", value: summary.recent, hint: "홈페이지 + 내 메일 + 프로젝트" }, { label: "초기 처리 대기", value: summary.waiting, hint: "홈페이지 문의·프로젝트" }, { label: "다음 연락 미정", value: missing, hint: "홈페이지 미종료 문의", alert: missing > 0 }, { label: "미확인 메일", value: mailKnown ? privateInbox.messages.filter(mail => !mail.readAt).length : "—", hint: mailKnown ? "답변 없이 확인 처리 가능" : mailLoad.kind === "loading" ? "메일 조회 중" : "메일 조회 실패" }].map(item => <div key={item.label} className={item.alert ? styles.attention : undefined}><dt>{item.label}</dt><dd>{item.value}<span>건</span></dd><p>{item.hint}</p></div>)}
        </dl>
        <InquiryChannelFlow channels={channels} selectedFilter={channel} total={items.length} preview={items.slice(0, 4).map(item => ({ key: item.key, name: contact(item.name) }))} onSelect={setFilter} onPreview={key => { setFilter("all"); selectItem(key); }} />
        <div ref={listRef} tabIndex={-1} className={styles.list}>
          <div className={styles.filters}>
            <label className={styles.search}><Search size={15} aria-hidden="true" /><input type="search" aria-label="문의 검색" placeholder="제목·상대·원문 검색" value={query} onChange={event => { setQuery(event.target.value); setPage(0); setCheckedMails(new Set()); }} /></label>
            <select aria-label="문의 채널" value={channel} onChange={event => setFilter(event.target.value)}><option value="all">전체 채널</option><option value="website">홈페이지</option><option value="Gmail">Gmail</option><option value="네이버">네이버</option><option value="project">프로젝트</option></select>
            <span role="status">{filtered.length}건 · 최신순</span>
          </div>
          <div className={styles.mailActions}><label><input type="checkbox" disabled={!mailKnown} checked={unreadOnly} onChange={event => { setUnreadOnly(event.target.checked); setPage(0); setCheckedMails(new Set()); }} />미확인 메일만</label><span>{mailKnown ? `전체 ${privateInbox.messages.length}건 · 미확인 ${privateInbox.messages.filter(mail => !mail.readAt).length}건` : mailLoad.kind === "loading" ? "메일 확인 중…" : "메일 조회 실패"}</span><Button type="button" size="sm" variant="outline" disabled={readBusy || selectedMails.length === 0} onClick={() => void markRead(selectedMails.map(mail => mail.id))}><CheckCheck size={14} />선택 {selectedMails.length}건 확인 처리</Button></div>
          {readMessage && <p role="status" className={styles.readMessage}>{readMessage}</p>}
          <div className={styles.tableWrap}><table><caption className="sr-only">통합 문의 목록. 상대를 누르면 오른쪽에서 원문과 연락 일정을 확인합니다.</caption><thead><tr><th scope="col"><input type="checkbox" aria-label="현재 페이지 메일 모두 선택" disabled={pageMailIds.length === 0 || readBusy} checked={pageMailIds.length > 0 && pageMailIds.every(id => checkedMails.has(id))} onChange={event => setCheckedMails(event.target.checked ? new Set(pageMailIds) : new Set())} /></th><th scope="col">시각</th><th scope="col">채널</th><th scope="col">상대 · 제목</th><th scope="col">내용 미리보기</th><th scope="col">상태</th><th scope="col">다음 연락</th></tr></thead><tbody>{rows.map(item => {
            const due = nextContactAt(item.key);
            const mail = mailByKey.get(item.key);
            return <tr key={item.key} className={item.key === selected?.key ? styles.selected : undefined}>
              <td>{mail && <input type="checkbox" aria-label={`${item.title} 선택`} checked={checkedMails.has(mail.id)} disabled={readBusy} onChange={event => checkMail(mail.id, event.target.checked)} />}</td><td className={styles.date}>{item.branch === "project" ? "기록 " : ""}{dateText(item.receivedTime)}</td><td><span className={styles.channelTag}>{item.branch === "mail" ? <Mail size={13} /> : item.branch === "project" ? <FolderKanban size={13} /> : <Globe size={13} />}{item.branch === "mail" || item.branch === "project" ? item.category : "홈페이지"}</span></td>
              <td><button type="button" className={styles.rowButton} onClick={() => selectItem(item.key)} aria-pressed={item.key === selected?.key} aria-controls="unified-inquiry-detail"><strong>{contact(item.name)}</strong><span>{item.title}</span></button></td>
              <td><p className={styles.excerpt}>{(masked ? maskInquiryBody(item) : item.body) || "원문 없음"}</p></td><td><span className={styles.status}>{mail ? mail.readAt ? "확인" : "미확인" : item.status}</span></td>
              <td className={due ? styles.scheduled : styles.unset}>{due ? dateText(new Date(due).getTime()) : "미정"}</td>
            </tr>;
          })}</tbody></table></div>
          <ul className={styles.mobileList} aria-label="통합 문의 간편 목록">{rows.map(item => {
            const due = nextContactAt(item.key);
            const mail = mailByKey.get(item.key);
            return <li key={item.key}>
              {mail && <input type="checkbox" aria-label={`${item.title} 선택`} checked={checkedMails.has(mail.id)} disabled={readBusy} onChange={event => checkMail(mail.id, event.target.checked)} />}
              <button type="button" onClick={() => selectItem(item.key)} aria-controls="unified-inquiry-detail" aria-pressed={item.key === selected?.key}>
                <span className={styles.mobileRowTop}>{contact(item.name)}<small>{item.branch === "mail" || item.branch === "project" ? item.category : "홈페이지"} · {item.branch === "project" ? "기록 " : ""}{dateText(item.receivedTime)}</small></span>
                <strong>{item.title}</strong><span className={styles.mobileExcerpt}>{(masked ? maskInquiryBody(item) : item.body).slice(0, 120)}</span>
                <span className={styles.mobileRowFoot}><span>{mail ? mail.readAt ? "확인" : "미확인" : item.status}</span><span className={due ? styles.scheduled : styles.unset}>{due ? `다음 연락 ${dateText(new Date(due).getTime())}` : "다음 연락 미정"}</span></span>
              </button>
            </li>;
          })}</ul>
          {rows.length === 0 && <p className={styles.empty}>{items.length ? "검색 조건에 맞는 문의가 없습니다." : "새 문의가 들어오면 이곳에 표시됩니다. 내 메일은 연결 후 수신 버튼으로 가져오세요."}</p>}
          <footer className={styles.pagination}><span>{currentPage + 1} / {pageCount} 페이지</span><div><Button variant="ghost" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</Button><Button variant="ghost" size="sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>다음</Button></div></footer>
        </div>
      </div>
      <section ref={detailRef} tabIndex={-1} id="unified-inquiry-detail" aria-label="선택한 문의 원문" className={styles.detail}>
        {selected ? <>
          <button type="button" className={styles.backToList} onClick={() => { listRef.current?.focus({ preventScroll: true }); listRef.current?.scrollIntoView({ block: "start" }); }}><ChevronLeft size={16} aria-hidden="true" />문의 목록으로</button>
          <h3>{selected.title}</h3><p className={styles.detailMeta}><span>{selected.category}</span>{!selectedProject && <span>{selected.status}</span>}<time>{selectedProject ? "기록 " : ""}{dateText(selected.receivedTime)}</time></p>
          {selectedProject ? <dl><dt>거래처</dt><dd>{contact(selectedProject.client || "거래처 미정")}</dd></dl> : <dl><dt>상대</dt><dd>{contact(selected.name)}</dd><dt>연락처</dt><dd>{contact(selected.email)}{selected.phone ? ` · ${contact(selected.phone)}` : ""}</dd></dl>}
          <h4>{selectedProject ? "업무 · 연락 메모" : "문의 내용"}</h4><p className={styles.original}>{(masked ? maskInquiryBody(selected) : selected.body) || "등록된 원문이 없습니다."}</p>
          {selectedProject ? <div className="mt-5 border-t border-border pt-4"><ProjectContactPanel key={selectedProject.id} project={selectedProject} canEdit={projectContacts?.canEdit ?? false} onChange={updated => setProjectContacts(previous => previous ? { ...previous, items: previous.items.map(item => item.id === updated.id ? updated : item) } : previous)} /></div> : <InboxFollowUpForm key={`${selected.key}:${followUps.get(selected.key)?.version ?? 0}`} itemKey={selected.key} value={followUps.get(selected.key)} onChange={receivePrivateInbox} />}
          {selected.branch !== "mail" && selected.branch !== "project" && <Button type="button" variant="outline" className="mt-5 w-full" onClick={() => { if (selected.branch !== "mail" && selected.branch !== "project") onOpenBoard(selected.branch); }}>해당 문의 보드에서 관리</Button>}
          <p className={styles.detailFoot}>{selected.branch === "mail" ? "내가 연결한 메일 · 본인만 조회" : selected.branch === "project" ? "프로젝트 연락 기록 · 내부 직원과 공유" : "홈페이지 문의 · 기존 담당자와 공유"}<br />알려진 이름·연락처만 가립니다. 원문에 별도로 적힌 개인정보는 확인해 주세요. 목록 조회로 원본 메일을 읽음 처리하지 않습니다.</p>
        </> : <div className={styles.empty}><CalendarClock size={24} aria-hidden="true" /><p>문의가 접수되면 원문과 다음 연락 일정을 확인할 수 있습니다.</p></div>}
      </section>
    </div>
  </section>;
}
