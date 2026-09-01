CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`playback_speed` real DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
