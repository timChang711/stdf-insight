CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`moderation` text DEFAULT 'pending' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`reply` text DEFAULT '' NOT NULL,
	`submitter_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "feedback_category_check" CHECK("feedback"."category" in ('feedback', 'feature', 'bug')),
	CONSTRAINT "feedback_moderation_check" CHECK("feedback"."moderation" in ('pending', 'approved', 'hidden')),
	CONSTRAINT "feedback_status_check" CHECK("feedback"."status" in ('new', 'planned', 'in_progress', 'completed'))
);
--> statement-breakpoint
CREATE INDEX `feedback_public_created_idx` ON `feedback` (`moderation`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `feedback_submitter_idx` ON `feedback` (`submitter_key`);