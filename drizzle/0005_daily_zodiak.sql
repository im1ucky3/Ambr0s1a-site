CREATE TABLE `dashboard_preferences` (
	`member_email` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
