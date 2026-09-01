CREATE TABLE IF NOT EXISTS `user_watch_modes` (
	`user_id` text PRIMARY KEY NOT NULL,
	`watch_mode` text DEFAULT 'new' NOT NULL,
	`updated_at` text NOT NULL
);
