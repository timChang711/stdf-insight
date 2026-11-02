CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_key` text NOT NULL,
	`request_key` text NOT NULL,
	`event` text NOT NULL,
	`name` text NOT NULL,
	`day` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "usage_events_type_check" CHECK("usage_events"."event" in ('page_view', 'feature', 'error'))
);
--> statement-breakpoint
CREATE INDEX `usage_events_created_idx` ON `usage_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `usage_events_visitor_day_idx` ON `usage_events` (`visitor_key`,`day`);--> statement-breakpoint
CREATE INDEX `usage_events_request_idx` ON `usage_events` (`request_key`);