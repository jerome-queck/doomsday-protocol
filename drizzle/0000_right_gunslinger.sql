CREATE TABLE `sync_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`external_event_id` text,
	`operation_count` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watch_progress` (
	`user_id` text NOT NULL,
	`content_key` text NOT NULL,
	`watched` integer DEFAULT false NOT NULL,
	`progress_seconds` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`observed_at` text NOT NULL,
	`external_event_id` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `content_key`)
);
