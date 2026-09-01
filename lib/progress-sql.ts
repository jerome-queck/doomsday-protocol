export const INSERT_OBSERVATIONS_SQL = `
  INSERT INTO progress_observations (
    observation_id, user_id, content_key, watched, progress_seconds, source,
    observed_at, external_event_id, idempotency_key, received_at, outcome
  )
  SELECT
    json_extract(operation.value, '$.observationId'),
    ?,
    json_extract(operation.value, '$.contentKey'),
    CAST(json_extract(operation.value, '$.watched') AS INTEGER),
    CAST(json_extract(operation.value, '$.progressSeconds') AS INTEGER),
    json_extract(operation.value, '$.source'),
    json_extract(operation.value, '$.observedAt'),
    json_extract(operation.value, '$.externalEventId'),
    json_extract(operation.value, '$.idempotencyKey'),
    ?,
    CASE
      WHEN json_extract(operation.value, '$.externalEventId') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM sync_events AS legacy_event
          WHERE legacy_event.user_id = ?
            AND legacy_event.source = json_extract(operation.value, '$.source')
            AND legacy_event.external_event_id = json_extract(operation.value, '$.externalEventId')
        )
        THEN 'duplicate_event'
      WHEN current.content_key IS NULL THEN 'applied'
      WHEN julianday(json_extract(operation.value, '$.observedAt')) < julianday(current.observed_at)
        THEN 'stale'
      WHEN julianday(json_extract(operation.value, '$.observedAt')) = julianday(current.observed_at)
        AND CAST(json_extract(operation.value, '$.watched') AS INTEGER) = current.watched
        AND CAST(json_extract(operation.value, '$.progressSeconds') AS INTEGER) = current.progress_seconds
        THEN 'unchanged'
      WHEN julianday(json_extract(operation.value, '$.observedAt')) = julianday(current.observed_at)
        THEN 'equal_timestamp_conflict'
      ELSE 'applied'
    END
  FROM json_each(?) AS operation
  LEFT JOIN watch_progress AS current
    ON current.user_id = ?
    AND current.content_key = json_extract(operation.value, '$.contentKey')
  ON CONFLICT(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
`;

export const APPLY_OBSERVATIONS_SQL = `
  INSERT INTO watch_progress (
    user_id, content_key, watched, progress_seconds, source,
    observed_at, external_event_id, updated_at
  )
  SELECT
    observation.user_id,
    observation.content_key,
    observation.watched,
    observation.progress_seconds,
    observation.source,
    observation.observed_at,
    observation.external_event_id,
    observation.received_at
  FROM progress_observations AS observation
  JOIN json_each(?) AS operation
    ON observation.observation_id = json_extract(operation.value, '$.observationId')
  WHERE observation.outcome = 'applied'
  ON CONFLICT(user_id, content_key) DO UPDATE SET
    watched = excluded.watched,
    progress_seconds = excluded.progress_seconds,
    source = excluded.source,
    observed_at = excluded.observed_at,
    external_event_id = excluded.external_event_id,
    updated_at = excluded.updated_at
  WHERE julianday(excluded.observed_at) > julianday(watch_progress.observed_at)
`;

export const LOG_SYNC_EVENTS_SQL = `
  INSERT INTO sync_events (
    user_id, source, external_event_id, operation_count, created_at
  )
  SELECT
    observation.user_id,
    observation.source,
    observation.external_event_id,
    SUM(CASE WHEN observation.outcome = 'applied' THEN 1 ELSE 0 END),
    ?
  FROM progress_observations AS observation
  JOIN json_each(?) AS operation
    ON observation.observation_id = json_extract(operation.value, '$.observationId')
  GROUP BY observation.user_id, observation.source, observation.external_event_id
  HAVING observation.external_event_id IS NOT NULL
    OR SUM(CASE WHEN observation.outcome = 'applied' THEN 1 ELSE 0 END) > 0
  ON CONFLICT(user_id, source, external_event_id) WHERE external_event_id IS NOT NULL DO NOTHING
`;

export const READ_RECEIPTS_SQL = `
  SELECT
    json_extract(operation.value, '$.contentKey') AS contentKey,
    COALESCE(observation.outcome, 'duplicate_event') AS outcome,
    json_extract(operation.value, '$.observedAt') AS observedAt,
    current.observed_at AS currentObservedAt
  FROM json_each(?) AS operation
  LEFT JOIN progress_observations AS observation
    ON observation.observation_id = json_extract(operation.value, '$.observationId')
  LEFT JOIN watch_progress AS current
    ON current.user_id = ?
    AND current.content_key = json_extract(operation.value, '$.contentKey')
  ORDER BY CAST(operation.key AS INTEGER)
`;

export const READ_PROGRESS_SQL = `
  SELECT
    content_key AS contentKey,
    watched,
    progress_seconds AS progressSeconds,
    source,
    observed_at AS observedAt,
    external_event_id AS externalEventId,
    updated_at AS updatedAt
  FROM watch_progress
  WHERE user_id = ?
  ORDER BY content_key
`;

export const READ_SOURCE_COUNTS_SQL = `
  SELECT source, outcome, COUNT(*) AS count
  FROM progress_observations
  WHERE user_id = ?
  GROUP BY source, outcome
  ORDER BY source, outcome
`;

export const READ_LATEST_OBSERVATION_SQL = `
  SELECT source, observed_at AS observedAt, received_at AS receivedAt
  FROM progress_observations
  WHERE user_id = ?
  ORDER BY received_at DESC
  LIMIT 1
`;

export const READ_LEGACY_COUNT_SQL = `
  SELECT COUNT(*) AS count
  FROM watch_progress AS progress
  WHERE progress.user_id = ?
    AND NOT EXISTS (
      SELECT 1
      FROM progress_observations AS observation
      WHERE observation.user_id = progress.user_id
        AND observation.content_key = progress.content_key
    )
`;

export const seedLegacyExternalObservationsSql = `
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
  WHERE external_event_id IS NOT NULL AND external_event_id <> ''
`;

export function legacyTvBackfillSql(tvRows: Array<{ n: number; episodeCount: number }>) {
  const values = tvRows.map((item) => `(${item.n},${item.episodeCount})`).join(',');
  return `
    WITH RECURSIVE
    tv(title_number, episode_count) AS (VALUES ${values}),
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
    WHERE julianday(excluded.observed_at) > julianday(watch_progress.observed_at)
  `;
}
