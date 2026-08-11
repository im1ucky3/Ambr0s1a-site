CREATE TABLE `site_content` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `members` ADD `avatar_key` text;--> statement-breakpoint
ALTER TABLE `members` ADD `notifications_read_at` text;--> statement-breakpoint
ALTER TABLE `members` ADD `is_active` integer DEFAULT true NOT NULL;