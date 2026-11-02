import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  nickname: text("nickname").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  moderation: text("moderation").notNull().default("pending"),
  status: text("status").notNull().default("new"),
  reply: text("reply").notNull().default(""),
  submitterKey: text("submitter_key").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("feedback_public_created_idx").on(table.moderation, table.createdAt, table.id),
  index("feedback_submitter_idx").on(table.submitterKey),
  check("feedback_category_check", sql`${table.category} in ('feedback', 'feature', 'bug')`),
  check("feedback_moderation_check", sql`${table.moderation} in ('pending', 'approved', 'hidden')`),
  check("feedback_status_check", sql`${table.status} in ('new', 'planned', 'in_progress', 'completed')`),
]);

export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey(),
  visitorKey: text("visitor_key").notNull(),
  requestKey: text("request_key").notNull(),
  event: text("event").notNull(),
  name: text("name").notNull(),
  day: text("day").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("usage_events_created_idx").on(table.createdAt),
  index("usage_events_visitor_day_idx").on(table.visitorKey, table.day),
  index("usage_events_request_idx").on(table.requestKey),
  check("usage_events_type_check", sql`${table.event} in ('page_view', 'feature', 'error')`),
]);
