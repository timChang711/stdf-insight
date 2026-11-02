import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";
import { FeedbackInputError } from "./feedback-validation";

export function feedbackDb() {
  if (!env.DB) throw new Error("Feedback database unavailable");
  return env.DB;
}
export function feedbackJson(value: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
}
export function feedbackError(error: unknown): Response {
  if (error instanceof FeedbackInputError) return feedbackJson({ error: error.code }, error.status);
  console.error("Feedback storage operation failed");
  return feedbackJson({ error: "unavailable" }, 503);
}
export async function feedbackAdminAccess(): Promise<"allowed" | "unauthorized" | "forbidden"> {
  const user = await getChatGPTUser();
  if (!user) return "unauthorized";
  const ownerEmail = env.FEEDBACK_ADMIN_EMAIL?.trim().toLowerCase();
  return ownerEmail && user.id && user.email.trim().toLowerCase() === ownerEmail ? "allowed" : "forbidden";
}
export async function submitterKey(request: Request): Promise<string> {
  const secret = env.FEEDBACK_RATE_LIMIT_SECRET;
  if (!secret) throw new Error("Feedback limit unavailable");
  // Cloudflare provides this at the edge. Missing IPs share a conservative bucket.
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${Math.floor(Date.now() / 3600000)}:${ip}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export const publicColumns = "id, nickname, category, title, body, status, reply, created_at AS createdAt, updated_at AS updatedAt";
