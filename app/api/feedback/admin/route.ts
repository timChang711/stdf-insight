import { feedbackAdminAccess, feedbackDb, feedbackError, feedbackJson, publicColumns } from "../../../lib/feedback-server";
import { moderations, parsePage } from "../../../lib/feedback-validation";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const access = await feedbackAdminAccess();
    if (access !== "allowed") return feedbackJson({ error: access }, access === "unauthorized" ? 401 : 403);
    const query = new URL(request.url).searchParams;
    const page = parsePage(query.get("page"));
    const moderation = query.get("moderation") ?? "pending";
    if (!page || (moderation !== "all" && !moderations.includes(moderation as typeof moderations[number]))) return feedbackJson({ error: "validation" }, 400);
    const result = await feedbackDb().prepare(`SELECT ${publicColumns}, moderation FROM feedback ${moderation === "all" ? "" : "WHERE moderation = ?"} ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET ?`).bind(...(moderation === "all" ? [] : [moderation]), (page - 1) * 20).all();
    return feedbackJson({ items: result.results.slice(0, 20), hasMore: result.results.length > 20, page });
  } catch (error) { return feedbackError(error); }
}
