ALTER TABLE `ctf_events` ADD `final_solves` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ctf_events` ADD `final_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ctf_events` ADD `final_members` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `team_invites` ADD `role` text DEFAULT 'member' NOT NULL;