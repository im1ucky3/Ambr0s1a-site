CREATE TABLE `ctf_events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ctftime_url` text,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`created_by` text NOT NULL,
	`final_place` integer,
	`final_points` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`member_email` text NOT NULL,
	`primary_category` text NOT NULL,
	`secondary_category` text NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `ctf_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `team_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`invited_username` text,
	`created_by` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_invites_token_hash_unique` ON `team_invites` (`token_hash`);--> statement-breakpoint
ALTER TABLE `members` ADD `username` text;--> statement-breakpoint
ALTER TABLE `members` ADD `auth_provider_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `members_username_unique` ON `members` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_auth_provider_id_unique` ON `members` (`auth_provider_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `event_id` text REFERENCES ctf_events(id);