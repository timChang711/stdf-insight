export const categories = ["feedback", "feature", "bug"] as const;
export const statuses = ["new", "planned", "in_progress", "completed"] as const;
export const moderations = ["pending", "approved", "hidden"] as const;
export type FeedbackCategory = typeof categories[number];
export type FeedbackStatus = typeof statuses[number];
export type FeedbackModeration = typeof moderations[number];
export type Submission = { id: string; nickname: string; category: FeedbackCategory; title: string; body: string };
export type ModerationUpdate = { moderation: FeedbackModeration; status: FeedbackStatus; reply: string; updatedAt: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isFeedbackId(value: string): boolean { return uuid.test(value); }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(trimmed) ? trimmed : null;
}
export function validateSubmission(value: unknown): Submission | null {
  if (!object(value) || value.consent !== true || (value.website !== undefined && value.website !== "")) return null;
  const nickname = text(value.nickname ?? "", 0, 40);
  const title = text(value.title, 3, 100);
  const body = text(value.body, 10, 3000);
  if (nickname === null || title === null || body === null || typeof value.id !== "string" || !isFeedbackId(value.id) || !categories.includes(value.category as FeedbackCategory)) return null;
  return { id: value.id.toLowerCase(), nickname, title, body, category: value.category as FeedbackCategory };
}
export function validateModeration(value: unknown): ModerationUpdate | null {
  if (!object(value) || !moderations.includes(value.moderation as FeedbackModeration) || !statuses.includes(value.status as FeedbackStatus)) return null;
  const reply = text(value.reply, 0, 3000);
  if (reply === null || typeof value.updatedAt !== "number" || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0) return null;
  return { moderation: value.moderation as FeedbackModeration, status: value.status as FeedbackStatus, reply, updatedAt: value.updatedAt };
}
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
export function parsePage(value: string | null): number | null {
  if (value === null) return 1;
  if (!/^[1-9]\d{0,3}$/.test(value)) return null;
  const page = Number(value);
  return page <= 500 ? page : null;
}
export class FeedbackInputError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status; }
}
export async function readFeedbackJson(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new FeedbackInputError("validation", 415);
  const limit = 16384;
  if (Number(request.headers.get("content-length")) > limit) throw new FeedbackInputError("too_large", 413);
  if (!request.body) throw new FeedbackInputError("validation", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new FeedbackInputError("too_large", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new FeedbackInputError("validation", 400); }
}
