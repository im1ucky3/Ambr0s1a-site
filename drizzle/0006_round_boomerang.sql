CREATE TABLE `ctfd_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`external_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`solve_count` integer DEFAULT 0 NOT NULL,
	`solved` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `ctf_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ctfd_challenges_event_external_unique` ON `ctfd_challenges` (`event_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `ctfd_integrations` (
	`event_id` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`token_ciphertext` text NOT NULL,
	`connected_by` text NOT NULL,
	`team_score` integer DEFAULT 0 NOT NULL,
	`total_challenges` integer DEFAULT 0 NOT NULL,
	`solved_challenges` integer DEFAULT 0 NOT NULL,
	`last_sync_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `ctf_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `ctfd_challenge_id` text;