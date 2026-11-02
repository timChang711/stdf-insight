import { feedbackDb, feedbackError, feedbackJson, submitterKey } from "../../lib/feedback-server";
import { isSameOrigin, readFeedbackJson, validateSubmission } from "../../lib/feedback-validation";
import type { Submission } from "../../lib/feedback-validation";

export const dynamic = "force-dynamic";
function matches(existing: Submission, value: Submission) {
  return existing.nickname === value.nickname && existing.category === value.category && existing.title === value.title && existing.body === value.body;
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return feedbackJson({ error: "invalid_origin" }, 403);
  try {
    const value = validateSubmission(await readFeedbackJson(request));
    if (!value) return feedbackJson({ error: "validation" }, 400);
    const db = feedbackDb();
    const existing = await db.prepare("SELECT id, nickname, category, title, body FROM feedback WHERE id = ?").bind(value.id).first<Submission>();
    if (existing) return matches(existing, value) ? feedbackJson({ ok: true, id: value.id, moderation: "pending" }, 201) : feedbackJson({ error: "conflict" }, 409);
    const key = await submitterKey(request);
    const now = Date.now();
    // One atomic statement protects the quota under simultaneous submissions.
    const inserted = await db.prepare("INSERT INTO feedback (id, nickname, category, title, body, submitter_key, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM feedback WHERE submitter_key = ?) < 5 ON CONFLICT(id) DO NOTHING RETURNING id").bind(value.id, value.nickname, value.category, value.title, value.body, key, now, now, key).first();
    if (!inserted) {
      const retry = await db.prepare("SELECT id, nickname, category, title, body FROM feedback WHERE id = ?").bind(value.id).first<Submission>();
      if (retry) return matches(retry, value) ? feedbackJson({ ok: true, id: value.id, moderation: "pending" }, 201) : feedbackJson({ error: "conflict" }, 409);
      return feedbackJson({ error: "rate_limit" }, 429, { "Retry-After": String(3600 - Math.floor(Date.now() / 1000) % 3600) });
    }
    return feedbackJson({ ok: true, id: value.id, moderation: "pending" }, 201);
  } catch (error) { return feedbackError(error); }
}
