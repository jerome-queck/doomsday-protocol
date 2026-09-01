import { env } from 'cloudflare:workers';
import watchlist from '@/data/watchlist.json';
import { classifyObservation } from './progress-contract';
import {
  APPLY_OBSERVATIONS_SQL,
  INSERT_OBSERVATIONS_SQL,
  LOG_SYNC_EVENTS_SQL,
  READ_LATEST_OBSERVATION_SQL,
  READ_LEGACY_COUNT_SQL,
  READ_PROGRESS_SQL,
  READ_RECEIPTS_SQL,
  READ_SOURCE_COUNTS_SQL,
  legacyTvBackfillSql,
  seedLegacyExternalObservationsSql,
} from './progress-sql';
import type {
  MarvelItem,
  OperationReceipt,
  ProgressOperation,
  ProgressRow,
  ReceiptOutcome,
} from './marvel-types';

let initialized = false;

const tvRows = (watchlist as MarvelItem[])
  .filter((item): item is MarvelItem & { episodeCount: number } => Boolean(item.episodeCount))
  .map((item) => ({ n: item.n, episodeCount: item.episodeCount }));

async function ensureSchema() {
  if (initialized) return;
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS watch_progress (user_id TEXT NOT NULL, content_key TEXT NOT NULL, watched INTEGER NOT NULL DEFAULT 0, progress_seconds INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual', observed_at TEXT NOT NULL, external_event_id TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, content_key))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sync_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, source TEXT NOT NULL, external_event_id TEXT, operation_count INTEGER NOT NULL, created_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_preferences (user_id TEXT PRIMARY KEY, playback_speed REAL NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_watch_modes (user_id TEXT PRIMARY KEY, watch_mode TEXT NOT NULL DEFAULT 'new', updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS progress_observations (observation_id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, content_key TEXT NOT NULL, watched INTEGER NOT NULL, progress_seconds INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL, observed_at TEXT NOT NULL, external_event_id TEXT, idempotency_key TEXT, received_at TEXT NOT NULL, outcome TEXT NOT NULL)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_watch_progress_user_watched ON watch_progress(user_id, watched)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_events_source_external ON sync_events(user_id, source, external_event_id) WHERE external_event_id IS NOT NULL`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_progress_observations_user_received ON progress_observations(user_id, received_at DESC)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_observations_idempotency ON progress_observations(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`),
  ]);
  await db.batch([
    db.prepare(legacyTvBackfillSql(tvRows)),
    db.prepare(seedLegacyExternalObservationsSql),
  ]);
  initialized = true;
}

export async function readProgress(userId: string) {
  await ensureSchema();
  const rows = await env.DB.prepare(READ_PROGRESS_SQL).bind(userId).all<ProgressRow>();
  return rows.results;
}

export async function readPreferences(userId: string) {
  await ensureSchema();
  const [row, modeRow] = await Promise.all([
    env.DB.prepare('SELECT playback_speed AS playbackSpeed FROM user_preferences WHERE user_id = ?')
      .bind(userId)
      .first<{ playbackSpeed: number }>(),
    env.DB.prepare('SELECT watch_mode AS watchMode FROM user_watch_modes WHERE user_id = ?')
      .bind(userId)
      .first<{ watchMode: string }>(),
  ]);
  const watchMode = ['new', 'doomsday', 'essentials'].includes(modeRow?.watchMode ?? '')
    ? modeRow!.watchMode
    : 'new';
  return { playbackSpeed: row?.playbackSpeed === 2 ? 2 : 1, watchMode };
}

export async function readSyncSummary(userId: string) {
  await ensureSchema();
  const [counts, latest, legacy] = await env.DB.batch([
    env.DB.prepare(READ_SOURCE_COUNTS_SQL).bind(userId),
    env.DB.prepare(READ_LATEST_OBSERVATION_SQL).bind(userId),
    env.DB.prepare(READ_LEGACY_COUNT_SQL).bind(userId),
  ]);
  return {
    counts: (counts.results ?? []) as Array<{ source: string; outcome: string; count: number }>,
    latest: ((latest.results ?? [])[0] ?? null) as
      | { source: string; observedAt: string; receivedAt: string }
      | null,
    legacyRows: Number(((legacy.results ?? [])[0] as { count?: number } | undefined)?.count ?? 0),
  };
}

export async function writePreferences(userId: string, playbackSpeed: number) {
  await ensureSchema();
  const speed = playbackSpeed === 2 ? 2 : 1;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_preferences (user_id, playback_speed, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET playback_speed=excluded.playback_speed, updated_at=excluded.updated_at`,
  )
    .bind(userId, speed, now)
    .run();
  return { playbackSpeed: speed, updatedAt: now };
}

export async function writeWatchMode(userId: string, watchMode: string) {
  await ensureSchema();
  const mode = ['new', 'doomsday', 'essentials'].includes(watchMode) ? watchMode : 'new';
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_watch_modes (user_id, watch_mode, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET watch_mode=excluded.watch_mode, updated_at=excluded.updated_at`,
  )
    .bind(userId, mode, now)
    .run();
  return { watchMode: mode, updatedAt: now };
}

const eventKey = (operation: ProgressOperation) =>
  operation.externalEventId
    ? `${operation.source}:${operation.externalEventId}:${operation.contentKey}`
    : null;

async function duplicateEventKeys(userId: string, operations: ProgressOperation[]) {
  const checks = operations.filter(
    (operation): operation is ProgressOperation & { externalEventId: string } =>
      Boolean(operation.externalEventId),
  );
  if (!checks.length) return new Set<string>();
  const results = await env.DB.batch(
    checks.map((operation) =>
      env.DB.prepare(
        `SELECT CASE WHEN
          EXISTS (
            SELECT 1 FROM progress_observations
            WHERE user_id = ? AND idempotency_key = ?
          ) OR EXISTS (
            SELECT 1 FROM sync_events
            WHERE user_id = ? AND source = ? AND external_event_id = ?
          ) THEN 1 ELSE 0 END AS duplicateEvent`,
      ).bind(
        userId,
        eventKey(operation),
        userId,
        operation.source,
        operation.externalEventId,
      ),
    ),
  );
  return new Set(
    checks.flatMap((operation, index) =>
      Number(((results[index]?.results ?? [])[0] as { duplicateEvent?: number } | undefined)?.duplicateEvent)
        ? [eventKey(operation)!]
        : [],
    ),
  );
}

async function previewState(userId: string, operations: ProgressOperation[]) {
  const [progress, duplicates] = await Promise.all([
    readProgress(userId),
    duplicateEventKeys(userId, operations),
  ]);
  return { progress, duplicates };
}

async function previewTokenFor(
  operations: ProgressOperation[],
  progress: ProgressRow[],
  duplicates: Set<string>,
) {
  const current = new Map(progress.map((row) => [row.contentKey, row]));
  const fingerprint = operations.map((operation) => {
    const row = current.get(operation.contentKey);
    return {
      operation,
      duplicate: duplicates.has(eventKey(operation) ?? ''),
      current: row
        ? {
            watched: Boolean(row.watched),
            progressSeconds: Number(row.progressSeconds ?? 0),
            observedAt: row.observedAt,
          }
        : null,
    };
  });
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(fingerprint)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function previewProgress(userId: string, operations: ProgressOperation[]) {
  await ensureSchema();
  const { progress, duplicates } = await previewState(userId, operations);
  const current = new Map(progress.map((row) => [row.contentKey, row]));
  const receipts = operations.map((operation) =>
    classifyObservation(operation, current.get(operation.contentKey), duplicates.has(eventKey(operation) ?? '')),
  );
  return {
    preview: true,
    previewToken: await previewTokenFor(operations, progress, duplicates),
    applied: receipts.filter((receipt) => receipt.outcome === 'applied').length,
    rejected: receipts.filter((receipt) => receipt.outcome !== 'applied').length,
    receipts,
  };
}

export class PreviewMismatchError extends Error {
  constructor() {
    super('Progress changed after this preview. Preview the import again before committing.');
    this.name = 'PreviewMismatchError';
  }
}

type SerializedObservation = Omit<ProgressOperation, 'watched' | 'progressSeconds' | 'externalEventId'> & {
  observationId: string;
  watched: 0 | 1;
  progressSeconds: number;
  externalEventId: string | null;
  idempotencyKey: string | null;
};

export async function writeProgress(
  userId: string,
  operations: ProgressOperation[],
  expectedPreviewToken?: string,
) {
  await ensureSchema();
  if (expectedPreviewToken) {
    const { progress, duplicates } = await previewState(userId, operations);
    const currentToken = await previewTokenFor(operations, progress, duplicates);
    if (currentToken !== expectedPreviewToken) throw new PreviewMismatchError();
  }

  const now = new Date().toISOString();
  const serialized: SerializedObservation[] = operations.map((operation) => ({
    contentKey: operation.contentKey,
    source: operation.source,
    observedAt: operation.observedAt,
    observationId: crypto.randomUUID(),
    watched: operation.watched ? 1 : 0,
    progressSeconds: operation.progressSeconds ?? 0,
    externalEventId: operation.externalEventId ?? null,
    idempotencyKey: eventKey(operation),
  }));
  const operationJson = JSON.stringify(serialized);
  const results = await env.DB.batch([
    env.DB.prepare(INSERT_OBSERVATIONS_SQL).bind(userId, now, userId, operationJson, userId),
    env.DB.prepare(READ_RECEIPTS_SQL).bind(operationJson, userId),
    env.DB.prepare(APPLY_OBSERVATIONS_SQL).bind(operationJson),
    env.DB.prepare(LOG_SYNC_EVENTS_SQL).bind(now, operationJson),
    env.DB.prepare(READ_PROGRESS_SQL).bind(userId),
    env.DB.prepare(READ_SOURCE_COUNTS_SQL).bind(userId),
    env.DB.prepare(READ_LATEST_OBSERVATION_SQL).bind(userId),
    env.DB.prepare(READ_LEGACY_COUNT_SQL).bind(userId),
  ]);

  const receipts = (results[1]?.results ?? []) as OperationReceipt[];
  const progress = (results[4]?.results ?? []) as ProgressRow[];
  const applied = receipts.filter((receipt) => receipt.outcome === 'applied').length;
  return {
    preview: false,
    applied,
    rejected: receipts.length - applied,
    receipts,
    progress,
    syncSummary: {
      counts: (results[5]?.results ?? []) as Array<{
        source: string;
        outcome: string;
        count: number;
      }>,
      latest: ((results[6]?.results ?? [])[0] ?? null) as
        | { source: string; observedAt: string; receivedAt: string }
        | null,
      legacyRows: Number(
        ((results[7]?.results ?? [])[0] as { count?: number } | undefined)?.count ?? 0,
      ),
    },
  };
}

export type { OperationReceipt, ProgressOperation, ProgressRow, ReceiptOutcome };
