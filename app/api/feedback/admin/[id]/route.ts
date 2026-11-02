import { feedbackAdminAccess, feedbackDb, feedbackError, feedbackJson } from "../../../../lib/feedback-server";
import { isFeedbackId, isSameOrigin, readFeedbackJson, validateModeration } from "../../../../lib/feedback-validation";

export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return feedbackJson({ error: "invalid_origin" }, 403);
  try {
    const access = await feedbackAdminAccess();
    if (access !== "allowed") return feedbackJson({ error: access }, access === "unauthorized" ? 401 : 403);
    const { id } = await context.params;
    if (!isFeedbackId(id)) return feedbackJson({ error: "validation" }, 400);
    const value = validateModeration(await readFeedbackJson(request));
    if (!value) return feedbackJson({ error: "validation" }, 400);
    const db = feedbackDb();
    const result = await db.prepare("UPDATE feedback SET moderation = ?, status = ?, reply = ?, updated_at = ? WHERE id = ? AND updated_at = ? RETURNING id").bind(value.moderation, value.status, value.reply, Math.max(Date.now(), value.updatedAt + 1), id, value.updatedAt).first();
    if (!result) {
      const existing = await db.prepare("SELECT id FROM feedback WHERE id = ?").bind(id).first();
      return feedbackJson({ error: existing ? "conflict" : "not_found" }, existing ? 409 : 404);
    }
    return feedbackJson({ ok: true });
  } catch (error) { return feedbackError(error); }
}
