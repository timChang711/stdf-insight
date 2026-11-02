import { isFeedbackId } from "./feedback-validation.ts";
export const usageNames = {
  page_view: ["/", "/about", "/feedback"],
  feature: ["overview", "tests", "wafer", "compare", "load_success", "export_summary"],
  error: ["load_error", "runtime_error", "unhandled_rejection"],
} as const;
export type UsageEvent = keyof typeof usageNames;
export function validateUsage(value: unknown): { id: string; visitorId: string; event: UsageEvent; name: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || !isFeedbackId(input.id) || typeof input.visitorId !== "string" || !isFeedbackId(input.visitorId) || typeof input.event !== "string" || !Object.hasOwn(usageNames, input.event) || typeof input.name !== "string") return null;
  const event = input.event as UsageEvent;
  if (!(usageNames[event] as readonly string[]).includes(input.name)) return null;
  return { id: input.id.toLowerCase(), visitorId: input.visitorId.toLowerCase(), event, name: input.name };
}
