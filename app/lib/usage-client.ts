"use client";

export type UsageFeature = "overview" | "tests" | "wafer" | "compare" | "load_success" | "export_summary";
export type UsageError = "load_error" | "runtime_error" | "unhandled_rejection";
type UsagePage = "/" | "/about" | "/feedback";
type UsageEvent = { event: "page_view"; name: UsagePage } | { event: "feature"; name: UsageFeature } | { event: "error"; name: UsageError };
type Visitor = { id: string; expiresAt: number };

const storageKey = "stdf-insight-usage-visitor-v1";
const visitorLifetime = 30 * 24 * 60 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pages: readonly string[] = ["/", "/about", "/feedback"];
const features: readonly string[] = ["overview", "tests", "wafer", "compare", "load_success", "export_summary"];
const errors: readonly string[] = ["load_error", "runtime_error", "unhandled_rejection"];
let memoryVisitor: Visitor | null = null;
let currentPath: string | null = null;
let viewedPath: string | null = null;
let errorCount = 0;

function canTrack(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const privacyNavigator = navigator as Navigator & { globalPrivacyControl?: boolean };
  const legacyWindow = window as Window & { doNotTrack?: string };
  if (privacyNavigator.globalPrivacyControl === true || [navigator.doNotTrack, legacyWindow.doNotTrack].some(value => value === "1" || value === "yes")) return false;
  return pages.includes(window.location.pathname);
}

function syncPage(pathname: string) {
  if (currentPath !== pathname) {
    currentPath = pathname;
    viewedPath = null;
    errorCount = 0;
  }
}

function visitorId(): string {
  const now = Date.now();
  if (memoryVisitor && memoryVisitor.expiresAt > now) return memoryVisitor.id;
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Partial<Visitor> | null;
    if (stored && typeof stored.id === "string" && uuid.test(stored.id) && typeof stored.expiresAt === "number" && stored.expiresAt > now && stored.expiresAt <= now + visitorLifetime) {
      memoryVisitor = { id: stored.id, expiresAt: stored.expiresAt };
      return memoryVisitor.id;
    }
  } catch { /* Blocked storage falls back to this page's memory. */ }
  memoryVisitor = { id: crypto.randomUUID(), expiresAt: now + visitorLifetime };
  try { window.localStorage.setItem(storageKey, JSON.stringify(memoryVisitor)); }
  catch { /* Analytics must not affect the application when storage is blocked. */ }
  return memoryVisitor.id;
}

function send(value: UsageEvent) {
  try {
    if (!canTrack()) return;
    // Only fixed event names and random IDs leave the browser. Never attach run data.
    const payload = { id: crypto.randomUUID(), visitorId: visitorId(), event: value.event, name: value.name };
    void fetch("/api/analytics", {
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  } catch { /* Analytics is optional and must never throw into application code. */ }
}

export function trackUsagePage(pathname: string) {
  try {
    syncPage(pathname);
    if (!canTrack() || !pages.includes(pathname) || pathname !== window.location.pathname || viewedPath === pathname) return;
    viewedPath = pathname;
    send({ event: "page_view", name: pathname as UsagePage });
  } catch { /* Ignore unavailable browser APIs. */ }
}

export function trackUsageFeature(name: UsageFeature) {
  if (!features.includes(name)) return;
  send({ event: "feature", name });
}

export function trackUsageError(name: UsageError) {
  try {
    if (!errors.includes(name) || !canTrack()) return;
    syncPage(window.location.pathname);
    if (errorCount >= 5) return;
    errorCount += 1;
    send({ event: "error", name });
  } catch { /* Never cause another error while reporting a generic failure. */ }
}
