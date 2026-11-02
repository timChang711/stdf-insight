import { env } from "cloudflare:workers";
import { feedbackDb, feedbackError, feedbackJson, submitterKey } from "../../lib/feedback-server";
import { isSameOrigin, readFeedbackJson } from "../../lib/feedback-validation";
import { validateUsage } from "../../lib/usage-validation";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return feedbackJson({ error: "invalid_origin" }, 403);
  // Honor privacy controls even when the client did not suppress collection.
  if (request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1") return feedbackJson({ ok: true }, 202);
  try {
    const event = validateUsage(await readFeedbackJson(request));
    if (!event) return feedbackJson({ error: "validation" }, 400);
    if (!env.FEEDBACK_RATE_LIMIT_SECRET) return feedbackJson({ error: "unavailable" }, 503);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw",encoder.encode(env.FEEDBACK_RATE_LIMIT_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const signed = await crypto.subtle.sign("HMAC",key,encoder.encode(`usage-visitor:${event.visitorId}`));
    const visitorKey = Array.from(new Uint8Array(signed),byte=>byte.toString(16).padStart(2,"0")).join("");
    const requestKey = await submitterKey(request);
    const now = Date.now();
    const day = new Date(now + 8 * 3600000).toISOString().slice(0,10);
    await feedbackDb().prepare("INSERT INTO usage_events (id,visitor_key,request_key,event,name,day,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM usage_events WHERE visitor_key=? AND day=?) < 500 AND (SELECT COUNT(*) FROM usage_events WHERE request_key=?) < 1000 ON CONFLICT(id) DO NOTHING").bind(event.id,visitorKey,requestKey,event.event,event.name,day,now,visitorKey,day,requestKey).run();
    return feedbackJson({ ok: true }, 202);
  } catch(error) { return feedbackError(error); }
}
