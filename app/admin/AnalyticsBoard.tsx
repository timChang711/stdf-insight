"use client";

import { useEffect, useState } from "react";
import "./admin-analytics.css";

type Locale = "zh-Hant" | "en";
type DailyCount = { date: string; visitors: number; pageViews: number; interactions: number; errors: number };
type NamedCount = { name: string; count: number };
type Analytics = {
  days: number;
  visitors: number;
  pageViews: number;
  interactions: number;
  errors: number;
  daily: DailyCount[];
  features: NamedCount[];
  errorTypes: NamedCount[];
  updatedAt: number;
};

const copy = {
  "zh-Hant": {
    kicker: "管理工作區", title: "使用概況", intro: "了解網站的使用情況、常用功能，以及需要留意的錯誤。",
    range: "統計期間", sevenDays: "近 7 天", thirtyDays: "近 30 天", refresh: "更新資料", loading: "正在載入使用統計…", loaded: "使用統計已更新。",
    visitors: "訪客瀏覽器", visitorsHint: "匿名瀏覽器數（估計）", pageViews: "頁面瀏覽", pageViewsHint: "頁面瀏覽事件次數", interactions: "功能操作", interactionsHint: "已記錄的功能操作次數", errors: "錯誤事件", errorsHint: "已記錄的錯誤次數",
    dailyTitle: "每日使用趨勢", dailyHint: "以頁面瀏覽次數呈現每日變化。", chart: "每日頁面瀏覽長條圖；完整數值請展開每日數據。", chartMaximum: "圖表最大值", viewsUnit: "次瀏覽", tableToggle: "查看每日數據", tableCaption: "所選期間每日的使用統計", date: "日期",
    features: "功能使用次數", featuresHint: "已記錄的各項功能操作。", errorTypes: "錯誤類型", errorTypesHint: "依錯誤事件類型彙整。", count: "次數", eventsUnit: "次", otherFeature: "其他功能", otherError: "其他錯誤",
    noData: "這段期間尚無使用紀錄", noDataHint: "網站開始收到使用事件後，資料會顯示在這裡。", noFeatures: "這段期間沒有功能操作紀錄。", noErrors: "這段期間沒有記錄到錯誤。", noDaily: "這段期間沒有每日紀錄。",
    timezone: "日期以台灣時間（UTC+8）計算。", updated: "資料更新時間", privacy: "訪客數以匿名瀏覽器估計，不代表實際人數。同一人使用不同瀏覽器可能重複計算。",
    failed: "暫時無法載入使用統計，請稍後重試。", unavailable: "統計服務暫時無法使用，請稍後重試。", session: "登入已失效或目前帳號沒有管理權限，請重新驗證身分。", authenticate: "重新驗證身分", retry: "重新載入",
    featureNames: { overview: "總覽", tests: "測項分析", wafer: "晶圓圖", compare: "比較分析", load_success: "成功載入檔案", export_summary: "匯出摘要" },
    errorNames: { load_error: "檔案載入失敗", runtime_error: "頁面執行錯誤", unhandled_rejection: "非預期處理錯誤" },
  },
  en: {
    kicker: "ADMIN WORKSPACE", title: "Usage overview", intro: "See how the site is used, which features visitors open, and which errors need attention.",
    range: "Reporting period", sevenDays: "Last 7 days", thirtyDays: "Last 30 days", refresh: "Refresh data", loading: "Loading usage statistics…", loaded: "Usage statistics updated.",
    visitors: "Visitor browsers", visitorsHint: "Anonymous browsers, estimated", pageViews: "Page views", pageViewsHint: "Recorded page-view events", interactions: "Feature interactions", interactionsHint: "Recorded feature actions", errors: "Error events", errorsHint: "Recorded errors",
    dailyTitle: "Daily activity", dailyHint: "Page views show how activity changes each day.", chart: "Daily page-view bar chart. Expand daily data for all values.", chartMaximum: "Chart maximum", viewsUnit: "views", tableToggle: "View daily data", tableCaption: "Daily usage statistics for the selected period", date: "Date",
    features: "Feature usage", featuresHint: "Recorded actions for each feature.", errorTypes: "Error types", errorTypesHint: "Recorded errors grouped by type.", count: "Count", eventsUnit: "events", otherFeature: "Other features", otherError: "Other errors",
    noData: "No usage recorded in this period", noDataHint: "Statistics will appear here when the site receives usage events.", noFeatures: "No feature actions were recorded in this period.", noErrors: "No errors were recorded in this period.", noDaily: "No daily activity was recorded in this period.",
    timezone: "Dates use Taiwan time (UTC+8).", updated: "Data updated", privacy: "Visitors are estimated anonymous browsers, not individual people. A person using different browsers may be counted more than once.",
    failed: "Usage statistics could not be loaded. Please try again.", unavailable: "The analytics service is temporarily unavailable. Please try again later.", session: "Your session has expired or this account no longer has admin access. Please verify your identity again.", authenticate: "Verify identity again", retry: "Reload",
    featureNames: { overview: "Overview", tests: "Test analysis", wafer: "Wafer map", compare: "Comparison", load_success: "Successful file loads", export_summary: "Summary exports" },
    errorNames: { load_error: "File loading errors", runtime_error: "Page errors", unhandled_rejection: "Unexpected operation errors" },
  },
};

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isAnalytics(value: unknown): value is Analytics {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<Analytics>;
  const validNamedCount = (entry: NamedCount) => entry && typeof entry.name === "string" && validCount(entry.count);
  return (data.days === 7 || data.days === 30)
    && validCount(data.visitors) && validCount(data.pageViews) && validCount(data.interactions) && validCount(data.errors)
    && validCount(data.updatedAt)
    && Array.isArray(data.daily) && data.daily.every((entry) => entry && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && validCount(entry.visitors) && validCount(entry.pageViews) && validCount(entry.interactions) && validCount(entry.errors))
    && Array.isArray(data.features) && data.features.every(validNamedCount)
    && Array.isArray(data.errorTypes) && data.errorTypes.every(validNamedCount);
}

function dateTime(value: number, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "zh-TW", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

function CountList({ items, locale, kind }: { items: NamedCount[]; locale: Locale; kind: "features" | "errors" }) {
  const text = copy[locale];
  const labels: Record<string, string> = kind === "features" ? text.featureNames : text.errorNames;
  const sorted = [...items].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  const maximum = Math.max(1, ...sorted.map((item) => item.count));
  return sorted.length ? <ul className="admin-analytics-count-list">
    {sorted.map((item) => <li key={item.name}>
      <div><span>{labels[item.name] ?? (kind === "features" ? text.otherFeature : text.otherError)}</span><strong>{item.count.toLocaleString(locale)} <small>{text.eventsUnit}</small></strong></div>
      <span className="admin-analytics-meter" aria-hidden="true"><span style={{ width: `${item.count / maximum * 100}%` }} /></span>
    </li>)}
  </ul> : <p className="admin-analytics-list-empty">{kind === "features" ? text.noFeatures : text.noErrors}</p>;
}

export default function AnalyticsBoard({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const [days, setDays] = useState<7 | 30>(7);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/analytics/admin?days=${days}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const result: unknown = await response.json().catch(() => null);
        if (!active) return;
        const code = result && typeof result === "object" && "error" in result ? result.error : null;
        if (response.status === 401 || response.status === 403 || code === "unauthorized" || code === "forbidden") {
          setSessionExpired(true);
          setData(null);
        } else if (response.status === 503 || code === "unavailable") {
          setError(text.unavailable);
        } else if (!response.ok || !isAnalytics(result) || result.days !== days) {
          setError(text.failed);
        } else {
          setData({ ...result, daily: [...result.daily].sort((left, right) => left.date.localeCompare(right.date)) });
        }
      } catch {
        if (active) setError(text.failed);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [days, revision, text]);

  const daily = data?.daily ?? [];
  const maxViews = Math.max(0, ...daily.map((day) => day.pageViews));
  const hasActivity = data && (data.visitors > 0 || data.pageViews > 0 || data.interactions > 0 || data.errors > 0);
  const summaries = data ? [
    { key: "visitors", label: text.visitors, hint: text.visitorsHint, count: data.visitors, icon: "◎" },
    { key: "views", label: text.pageViews, hint: text.pageViewsHint, count: data.pageViews, icon: "▤" },
    { key: "interactions", label: text.interactions, hint: text.interactionsHint, count: data.interactions, icon: "↗" },
    { key: "errors", label: text.errors, hint: text.errorsHint, count: data.errors, icon: "!" },
  ] : [];

  return <section className="admin-analytics" lang={locale} aria-labelledby="admin-analytics-title">
    <div className="admin-analytics-heading"><span className="admin-analytics-kicker">{text.kicker}</span><h1 id="admin-analytics-title">{text.title}</h1><p>{text.intro}</p></div>
    <div className="admin-analytics-toolbar">
      <div className="admin-analytics-range" role="group" aria-label={text.range}>
        <button type="button" aria-pressed={days === 7} disabled={sessionExpired} onClick={() => setDays(7)}>{text.sevenDays}</button>
        <button type="button" aria-pressed={days === 30} disabled={sessionExpired} onClick={() => setDays(30)}>{text.thirtyDays}</button>
      </div>
      <button type="button" className="admin-analytics-refresh" onClick={() => setRevision((value) => value + 1)} disabled={loading || sessionExpired}>{text.refresh}</button>
    </div>
    <p className="admin-analytics-timezone">{text.timezone}</p>
    <div className="admin-analytics-sr-only" role="status" aria-live="polite">{loading ? text.loading : data && !error && !sessionExpired ? text.loaded : ""}</div>
    {sessionExpired ? <div className="admin-analytics-alert" role="alert"><p>{text.session}</p><button type="button" onClick={() => window.location.reload()}>{text.authenticate}</button></div>
      : error ? <div className="admin-analytics-alert" role="alert"><p>{error}</p><button type="button" onClick={() => setRevision((value) => value + 1)}>{text.retry}</button></div>
        : loading ? <div className="admin-analytics-loading" aria-busy="true"><span className="admin-analytics-spinner" aria-hidden="true" /><p>{text.loading}</p></div>
          : data && <>
            <div className="admin-analytics-summary">
              {summaries.map((summary) => <article key={summary.key} className={`admin-analytics-stat admin-analytics-stat-${summary.key}`}>
                <div><h2>{summary.label}</h2><span aria-hidden="true">{summary.icon}</span></div>
                <strong>{summary.count.toLocaleString(locale)}</strong><p>{summary.hint}</p>
              </article>)}
            </div>
            <p className="admin-analytics-privacy">{text.privacy}</p>
            <section className="admin-analytics-panel admin-analytics-daily" aria-labelledby="admin-analytics-daily-title">
              <div className="admin-analytics-panel-heading"><div><h2 id="admin-analytics-daily-title">{text.dailyTitle}</h2><p>{text.dailyHint}</p></div>{daily.length > 0 && <span className="admin-analytics-period">{daily[0].date} — {daily[daily.length - 1].date}</span>}</div>
              {!hasActivity ? <div className="admin-analytics-empty"><span aria-hidden="true">▥</span><h3>{text.noData}</h3><p>{text.noDataHint}</p></div>
                : daily.length > 0 ? <div className="admin-analytics-chart" role="img" aria-label={text.chart}>
                  <div className="admin-analytics-chart-scale" aria-hidden="true"><span>{maxViews.toLocaleString(locale)} {text.viewsUnit}</span><span>0</span></div>
                  <div className={`admin-analytics-bars ${days === 30 ? "admin-analytics-bars-month" : ""}`} aria-hidden="true">
                    {daily.map((day, index) => <div className="admin-analytics-day" key={day.date} title={`${day.date}: ${day.pageViews.toLocaleString(locale)} ${text.viewsUnit}`}>
                      <div className="admin-analytics-bar-track"><span className={day.pageViews ? "admin-analytics-bar" : "admin-analytics-bar-zero"} style={{ height: `${day.pageViews / Math.max(1, maxViews) * 100}%` }} /></div>
                      <span className="admin-analytics-day-label">{days === 7 || index === 0 || index === daily.length - 1 || (index + 1) % 5 === 0 ? day.date.slice(5).replace("-", "/") : ""}</span>
                    </div>)}
                  </div>
                </div> : <p className="admin-analytics-list-empty">{text.noDaily}</p>}
              {daily.length > 0 && <details className="admin-analytics-table-details"><summary>{text.tableToggle}</summary><div className="admin-analytics-table-scroll" role="region" tabIndex={0} aria-label={text.tableCaption}>
                <table><caption>{text.tableCaption}</caption><thead><tr><th scope="col">{text.date}</th><th scope="col">{text.visitors}</th><th scope="col">{text.pageViews}</th><th scope="col">{text.interactions}</th><th scope="col">{text.errors}</th></tr></thead>
                  <tbody>{daily.map((day) => <tr key={day.date}><th scope="row"><time dateTime={day.date}>{day.date}</time></th><td>{day.visitors.toLocaleString(locale)}</td><td>{day.pageViews.toLocaleString(locale)}</td><td>{day.interactions.toLocaleString(locale)}</td><td>{day.errors.toLocaleString(locale)}</td></tr>)}</tbody>
                </table></div></details>}
            </section>
            <div className="admin-analytics-breakdowns">
              <section className="admin-analytics-panel" aria-labelledby="admin-analytics-features-title"><div className="admin-analytics-panel-heading"><div><h2 id="admin-analytics-features-title">{text.features}</h2><p>{text.featuresHint}</p></div></div><CountList items={data.features} locale={locale} kind="features" /></section>
              <section className="admin-analytics-panel admin-analytics-errors" aria-labelledby="admin-analytics-errors-title"><div className="admin-analytics-panel-heading"><div><h2 id="admin-analytics-errors-title">{text.errorTypes}</h2><p>{text.errorTypesHint}</p></div></div><CountList items={data.errorTypes} locale={locale} kind="errors" /></section>
            </div>
            <p className="admin-analytics-updated">{text.updated}：<time dateTime={new Date(data.updatedAt).toISOString()}>{dateTime(data.updatedAt, locale)}</time> · UTC+8</p>
          </>}
  </section>;
}
