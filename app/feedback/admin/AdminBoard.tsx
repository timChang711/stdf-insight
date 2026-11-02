"use client";

import { useEffect, useState, type FormEvent } from "react";
import "./admin.css";

type Locale = "zh-Hant" | "en";
type Moderation = "pending" | "approved" | "hidden";
type Status = "new" | "planned" | "in_progress" | "completed";
type Filter = Moderation | "all";
type FeedbackItem = {
  id: string;
  nickname: string;
  category: "feedback" | "feature" | "bug";
  title: string;
  body: string;
  moderation: Moderation;
  status: Status;
  reply: string | null;
  createdAt: number;
  updatedAt: number;
};

const copy = {
  "zh-Hant": {
    kicker: "管理工作區", title: "私密留言", intro: "查看訪客送給你的留言與功能許願，加入管理備註，並記錄後續進度。內容僅限站長查看。",
    board: "開啟留言表單", filter: "篩選留言", filters: { pending: "待處理", approved: "已處理", hidden: "已封存", all: "全部留言" },
    loading: "正在載入留言…", refreshing: "正在更新留言…", empty: "這裡目前沒有留言", emptyHint: "此分類下的留言會顯示在這裡。", retry: "重新載入",
    loadError: "暫時無法載入留言，請稍後重試。", unavailable: "留言服務暫時無法使用，請稍後重試。", session: "登入已失效或目前帳號沒有管理權限，請重新驗證身分。", authenticate: "重新驗證身分",
    saved: "變更已儲存。", previous: "上一頁", next: "下一頁", page: "第", pageSuffix: "頁", perPage: "每頁最多 20 則留言", results: "則留言", submitted: "投稿時間", updated: "最後更新",
    category: { feedback: "一般留言", feature: "功能許願", bug: "問題回報" }, moderation: "處理狀態", moderationOptions: { pending: "待處理", approved: "已處理", hidden: "已封存" },
    status: "追蹤進度", statuses: { new: "待評估", planned: "規劃中", in_progress: "開發中", completed: "已完成" }, reply: "管理備註", replyHint: "僅限站長查看，不會傳送給留言者。", replyPlaceholder: "記錄評估結果、後續工作或處理進度…",
    replyLimit: "備註最多 3,000 字。", save: "儲存變更", saving: "正在儲存…", noChanges: "尚無變更", unsaved: "尚未儲存", saveError: "無法儲存變更。你的內容仍保留在此頁，請重試。",
    conflict: "這則留言已被其他管理工作階段更新。請先複製尚未儲存的內容，再重新載入並確認最新版本。", validation: "資料格式不正確，請檢查備註長度後重試。", notFound: "找不到這則留言，請重新載入列表。", invalidOrigin: "無法驗證這次操作，請重新載入頁面再試。",
    hiddenHint: "已封存的留言仍會保留，可隨時改回待處理。", pendingHint: "這則留言仍待你查看或處理。", approvedHint: "將這則留言標記為已處理，並保留紀錄。",
  },
  en: {
    kicker: "ADMIN WORKSPACE", title: "Private inbox", intro: "Read visitor feedback and feature requests, add internal notes, and track next steps. Only the site owner can access these submissions.",
    board: "Open feedback form", filter: "Filter submissions", filters: { pending: "Pending", approved: "Reviewed", hidden: "Archived", all: "All submissions" },
    loading: "Loading submissions…", refreshing: "Refreshing submissions…", empty: "No submissions here yet", emptyHint: "Submissions in this category will appear here.", retry: "Reload",
    loadError: "Submissions could not be loaded. Please try again.", unavailable: "The feedback service is temporarily unavailable. Please try again later.", session: "Your session has expired or this account no longer has admin access. Please verify your identity again.", authenticate: "Verify identity again",
    saved: "Changes saved.", previous: "Previous", next: "Next", page: "Page", pageSuffix: "", perPage: "Up to 20 submissions per page", results: "submissions", submitted: "Submitted", updated: "Last updated",
    category: { feedback: "Feedback", feature: "Feature request", bug: "Bug report" }, moderation: "Review status", moderationOptions: { pending: "Pending", approved: "Reviewed", hidden: "Archived" },
    status: "Progress", statuses: { new: "Under review", planned: "Planned", in_progress: "In progress", completed: "Completed" }, reply: "Internal note", replyHint: "Only the site owner can see this note. It is not sent to the visitor.", replyPlaceholder: "Record your assessment, next steps, or progress…",
    replyLimit: "Notes can contain up to 3,000 characters.", save: "Save changes", saving: "Saving…", noChanges: "No changes", unsaved: "Unsaved changes", saveError: "Changes could not be saved. Your draft is still on this page. Please try again.",
    conflict: "Another admin session updated this submission. Copy your unsaved draft, then reload to review the latest version before saving.", validation: "Some details are invalid. Check the note length and try again.", notFound: "This submission could not be found. Please reload the list.", invalidOrigin: "This action could not be verified. Please reload the page and try again.",
    hiddenHint: "Archived submissions are kept. You can move them back to pending at any time.", pendingHint: "This submission is waiting for your review or action.", approvedHint: "Mark this submission as reviewed and keep its record.",
  },
};

function formatDate(value: number, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "zh-TW", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei",
  }).format(date);
}

function FeedbackEditor({ item, locale, disabled, onSaved, onSessionExpired, onReload, onSavingChange }: {
  item: FeedbackItem;
  locale: Locale;
  disabled: boolean;
  onSaved: () => void;
  onSessionExpired: () => void;
  onReload: () => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const text = copy[locale];
  const [moderation, setModeration] = useState(item.moderation);
  const [status, setStatus] = useState(item.status);
  const [reply, setReply] = useState(item.reply ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const dirty = moderation !== item.moderation || status !== item.status || reply !== (item.reply ?? "");
  const prefix = `feedback-admin-${item.id}`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || disabled || !dirty || needsReload) return;
    if (reply.length > 3000) {
      setError(text.replyLimit);
      return;
    }
    setSaving(true);
    setError("");
    onSavingChange(true);
    try {
      const response = await fetch(`/api/feedback/admin/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moderation, status, reply, updatedAt: item.updatedAt }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (result?.error === "invalid_origin") {
        setError(text.invalidOrigin);
      } else if (response.status === 401 || response.status === 403 || result?.error === "unauthorized" || result?.error === "forbidden") {
        onSessionExpired();
        setError(text.session);
      } else if (response.status === 409 || result?.error === "conflict") {
        setNeedsReload(true);
        setError(text.conflict);
      } else if (response.status === 503 || result?.error === "unavailable") {
        setError(text.unavailable);
      } else if (result?.error === "not_found") {
        setNeedsReload(true);
        setError(text.notFound);
      } else if (result?.error === "validation") {
        setError(text.validation);
      } else if (!response.ok || result?.ok !== true) {
        setError(text.saveError);
      } else {
        onSaved();
      }
    } catch {
      setError(text.saveError);
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  }

  return <article className="feedback-admin-card" aria-labelledby={`${prefix}-title`}>
    <div className="feedback-admin-submission">
      <div className="feedback-admin-meta">
        <span className="feedback-admin-category">{text.category[item.category]}</span>
        <span className={`feedback-admin-badge feedback-admin-badge-${item.moderation}`}>{text.moderationOptions[item.moderation]}</span>
      </div>
      <h2 id={`${prefix}-title`}>{item.title}</h2>
      <p className="feedback-admin-author">{item.nickname}</p>
      <p className="feedback-admin-body">{item.body}</p>
      <dl className="feedback-admin-dates">
        <div><dt>{text.submitted}</dt><dd><time dateTime={new Date(item.createdAt).toISOString()}>{formatDate(item.createdAt, locale)}</time></dd></div>
        <div><dt>{text.updated}</dt><dd><time dateTime={new Date(item.updatedAt).toISOString()}>{formatDate(item.updatedAt, locale)}</time></dd></div>
      </dl>
    </div>
    <form className="feedback-admin-editor" onSubmit={save}>
      <div className="feedback-admin-fields">
        <label htmlFor={`${prefix}-moderation`}>{text.moderation}
          <select id={`${prefix}-moderation`} value={moderation} disabled={disabled || saving} onChange={(event) => setModeration(event.target.value as Moderation)}>
            {(Object.keys(text.moderationOptions) as Moderation[]).map((value) => <option key={value} value={value}>{text.moderationOptions[value]}</option>)}
          </select>
        </label>
        <label htmlFor={`${prefix}-status`}>{text.status}
          <select id={`${prefix}-status`} value={status} disabled={disabled || saving} onChange={(event) => setStatus(event.target.value as Status)}>
            {(Object.keys(text.statuses) as Status[]).map((value) => <option key={value} value={value}>{text.statuses[value]}</option>)}
          </select>
        </label>
      </div>
      <p className="feedback-admin-workflow-note">{moderation === "approved" ? text.approvedHint : moderation === "hidden" ? text.hiddenHint : text.pendingHint}</p>
      <label className="feedback-admin-reply-label" htmlFor={`${prefix}-reply`}>{text.reply}</label>
      <textarea id={`${prefix}-reply`} value={reply} rows={5} maxLength={3000} placeholder={text.replyPlaceholder} readOnly={disabled || saving} aria-describedby={`${prefix}-reply-hint ${prefix}-reply-count`} onChange={(event) => setReply(event.target.value)} />
      <div className="feedback-admin-reply-help"><p id={`${prefix}-reply-hint`}>{text.replyHint}</p><span id={`${prefix}-reply-count`}>{reply.length.toLocaleString(locale)} / 3,000</span></div>
      {error && <div className="feedback-admin-inline-error" role="alert"><p>{error}</p>{needsReload && <button className="feedback-admin-text-button" type="button" onClick={onReload}>{text.retry}</button>}</div>}
      <div className="feedback-admin-save-row">
        <span className={dirty ? "feedback-admin-dirty" : ""}>{dirty ? text.unsaved : text.noChanges}</span>
        <button className="feedback-admin-primary" type="submit" disabled={disabled || saving || !dirty || needsReload}>{saving ? text.saving : text.save}</button>
      </div>
    </form>
  </article>;
}

export default function AdminBoard({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const [filter, setFilter] = useState<Filter>("pending");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeSaves, setActiveSaves] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/feedback/admin?moderation=${filter}&page=${page}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const result = await response.json().catch(() => null) as { items?: FeedbackItem[]; hasMore?: boolean; error?: string } | null;
        if (!active) return;
        if (response.status === 401 || response.status === 403 || result?.error === "unauthorized" || result?.error === "forbidden") {
          setSessionExpired(true);
        } else if (response.status === 503 || result?.error === "unavailable") {
          setError(text.unavailable);
        } else if (!response.ok || !Array.isArray(result?.items)) {
          setError(text.loadError);
        } else {
          setItems(result.items);
          setHasMore(result.hasMore === true);
        }
      } catch {
        if (active) setError(text.loadError);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [filter, page, revision, text]);

  function reload() { setNotice(""); setRevision((value) => value + 1); }
  function saved() { setNotice(text.saved); setRevision((value) => value + 1); }
  function changeFilter(next: Filter) { setNotice(""); setPage(1); setFilter(next); }
  function changePage(next: number) { setNotice(""); setPage(next); }
  const controlsDisabled = loading || activeSaves > 0 || sessionExpired;

  return <section className="feedback-admin" lang={locale} aria-labelledby="feedback-admin-title">
    <div className="feedback-admin-heading">
      <div><span className="feedback-admin-kicker">{text.kicker}</span><h1 id="feedback-admin-title">{text.title}</h1><p>{text.intro}</p></div>
      <a href={`/feedback?lang=${locale}`} className="feedback-admin-board-link">{text.board}<span aria-hidden="true">↗</span></a>
    </div>
    {sessionExpired && <div className="feedback-admin-alert" role="alert"><p>{text.session}</p><button className="feedback-admin-primary" type="button" onClick={() => window.location.reload()}>{text.authenticate}</button></div>}
      <div className="feedback-admin-toolbar">
        <div className="feedback-admin-filters" role="group" aria-label={text.filter}>
          {(Object.keys(text.filters) as Filter[]).map((value) => <button key={value} type="button" aria-pressed={filter === value} disabled={controlsDisabled} onClick={() => changeFilter(value)}>{text.filters[value]}</button>)}
        </div>
        <button type="button" className="feedback-admin-reload" onClick={reload} disabled={controlsDisabled}>{text.retry}</button>
      </div>
      <div className="feedback-admin-list-status" role="status" aria-live="polite">{loading ? (items.length ? text.refreshing : text.loading) : notice || (!error && !sessionExpired ? `${items.length} ${text.results}` : "")}</div>
      {error && <div className="feedback-admin-alert" role="alert"><p>{error}</p><button className="feedback-admin-secondary" type="button" onClick={reload} disabled={loading || activeSaves > 0}>{text.retry}</button></div>}
      <div className="feedback-admin-list" aria-busy={loading}>
        {!error && !loading && !sessionExpired && items.length === 0 && <div className="feedback-admin-empty"><span aria-hidden="true">✓</span><h2>{text.empty}</h2><p>{text.emptyHint}</p></div>}
        {!error && items.map((item) => <FeedbackEditor key={`${item.id}:${item.updatedAt}`} item={item} locale={locale} disabled={loading || sessionExpired} onSaved={saved} onSessionExpired={() => setSessionExpired(true)} onReload={reload} onSavingChange={(saving) => setActiveSaves((value) => Math.max(0, value + (saving ? 1 : -1)))} />)}
      </div>
      <div className="feedback-admin-pagination">
        <p>{text.perPage}</p>
        <nav aria-label={locale === "en" ? "Submission pages" : "留言分頁"}>
          <button type="button" onClick={() => changePage(page - 1)} disabled={page === 1 || controlsDisabled}>{text.previous}</button>
          <span aria-current="page">{text.page} {page} {text.pageSuffix}</span>
          <button type="button" onClick={() => changePage(page + 1)} disabled={!hasMore || controlsDisabled || !!error}>{text.next}</button>
        </nav>
      </div>
  </section>;
}
