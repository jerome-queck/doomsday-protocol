CREATE TABLE IF NOT EXISTS `progress_observations` (
	`observation_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content_key` text NOT NULL,
	`watched` integer NOT NULL,
	`progress_seconds` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`observed_at` text NOT NULL,
	`external_event_id` text,
	`idempotency_key` text,
	`received_at` text NOT NULL,
	`outcome` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_progress_observations_user_received` ON `progress_observations` (`user_id`,`received_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_progress_observations_idempotency` ON `progress_observations` (`user_id`,`idempotency_key`) WHERE `idempotency_key` IS NOT NULL;
--> statement-breakpoint
WITH RECURSIVE
tv(title_number, episode_count) AS (
  VALUES
  (3,8),(4,10),(18,13),(36,8),(37,10),(38,9),(51,22),(58,22),
  (59,13),(60,13),(64,22),(65,13),(70,13),(71,13),(72,8),(74,4),
  (77,13),(79,10),(80,22),(81,6),(82,8),(83,13),(85,8),(86,11),
  (87,8),(88,13),(89,16),(90,13),(91,10),(92,13),(93,10),(96,22),
  (97,10),(98,13),(99,10),(102,13),(103,13),(109,10),(113,9),
  (115,6),(116,6),(117,9),(118,13),(119,13),(123,6),(132,6),
  (133,6),(136,9),(137,5),(138,6),(148,6),(150,4),(151,6),
  (152,9),(153,9),(155,9),(156,10),(157,9),(160,8),(161,8),(164,8)
),
episodes(title_number, episode, episode_count) AS (
  SELECT title_number, 1, episode_count FROM tv
  UNION ALL
  SELECT title_number, episode + 1, episode_count
  FROM episodes
  WHERE episode < episode_count
)
INSERT INTO watch_progress (
  user_id, content_key, watched, progress_seconds, source,
  observed_at, external_event_id, updated_at
)
SELECT
  progress.user_id,
  printf('episode:%d:%d', episodes.title_number, episodes.episode),
  1,
  0,
  progress.source,
  progress.observed_at,
  progress.external_event_id,
  progress.updated_at
FROM watch_progress AS progress
JOIN episodes
  ON progress.content_key = printf('title:%d', episodes.title_number)
WHERE progress.watched = 1
ON CONFLICT(user_id, content_key) DO UPDATE SET
  watched = excluded.watched,
  progress_seconds = excluded.progress_seconds,
  source = excluded.source,
  observed_at = excluded.observed_at,
  external_event_id = excluded.external_event_id,
  updated_at = excluded.updated_at
WHERE julianday(excluded.observed_at) > julianday(watch_progress.observed_at);
--> statement-breakpoint
INSERT OR IGNORE INTO progress_observations (
  observation_id, user_id, content_key, watched, progress_seconds,
  source, observed_at, external_event_id, idempotency_key, received_at, outcome
)
SELECT
  'legacy:' || hex(user_id) || ':' || hex(source) || ':' ||
    hex(external_event_id) || ':' || hex(content_key),
  user_id,
  content_key,
  watched,
  progress_seconds,
  source,
  observed_at,
  external_event_id,
  source || ':' || external_event_id || ':' || content_key,
  updated_at,
  'applied'
FROM watch_progress
WHERE external_event_id IS NOT NULL AND external_event_id <> '';
