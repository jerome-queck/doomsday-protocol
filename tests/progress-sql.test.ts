import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  APPLY_OBSERVATIONS_SQL,
  INSERT_OBSERVATIONS_SQL,
  LOG_SYNC_EVENTS_SQL,
  READ_RECEIPTS_SQL,
} from '../lib/progress-sql.ts';

const userId = 'user-1';
const now = '2026-08-31T04:00:00.000Z';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE watch_progress (
      user_id TEXT NOT NULL,
      content_key TEXT NOT NULL,
      watched INTEGER NOT NULL DEFAULT 0,
      progress_seconds INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      observed_at TEXT NOT NULL,
      external_event_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, content_key)
    );
    CREATE TABLE sync_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      external_event_id TEXT,
      operation_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX idx_sync_events_source_external
      ON sync_events(user_id, source, external_event_id)
      WHERE external_event_id IS NOT NULL;
    CREATE TABLE progress_observations (
      observation_id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      content_key TEXT NOT NULL,
      watched INTEGER NOT NULL,
      progress_seconds INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      external_event_id TEXT,
      idempotency_key TEXT,
      received_at TEXT NOT NULL,
      outcome TEXT NOT NULL
    );
    CREATE UNIQUE INDEX idx_progress_observations_idempotency
      ON progress_observations(user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  `);
  return db;
}

const operation = (
  observationId: string,
  observedAt: string,
  externalEventId: string,
  watched = 1,
) => ({
  observationId,
  contentKey: 'title:1',
  watched,
  progressSeconds: 0,
  source: 'jellyfin',
  observedAt,
  externalEventId,
  idempotencyKey: `jellyfin:${externalEventId}:title:1`,
});

function mutate(db: DatabaseSync, value: ReturnType<typeof operation>) {
  const json = JSON.stringify([value]);
  db.exec('BEGIN');
  try {
    db.prepare(INSERT_OBSERVATIONS_SQL).run(userId, now, userId, json, userId);
    const receipts = db.prepare(READ_RECEIPTS_SQL).all(json, userId);
    db.prepare(APPLY_OBSERVATIONS_SQL).run(json);
    db.prepare(LOG_SYNC_EVENTS_SQL).run(now, json);
    db.exec('COMMIT');
    return receipts as Array<Record<string, unknown>>;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

test('atomic SQL applies newer state and turns external replay into a duplicate receipt', () => {
  const db = database();
  const first = mutate(db, operation('obs-1', '2026-08-31T03:00:00.000Z', 'event-1'));
  assert.equal(first[0].outcome, 'applied');
  assert.equal(db.prepare('SELECT watched FROM watch_progress').get()!.watched, 1);

  const replay = mutate(db, operation('obs-2', '2026-08-31T03:00:00.000Z', 'event-1'));
  assert.equal(replay[0].outcome, 'duplicate_event');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM progress_observations').get()!.count, 1);
  db.close();
});

test('stale external event is tombstoned without changing materialized state', () => {
  const db = database();
  mutate(db, operation('obs-current', '2026-08-31T03:00:00.000Z', 'event-current'));
  const stale = mutate(
    db,
    operation('obs-stale', '2026-08-30T03:00:00.000Z', 'event-stale', 0),
  );
  assert.equal(stale[0].outcome, 'stale');
  assert.equal(db.prepare('SELECT watched FROM watch_progress').get()!.watched, 1);
  assert.equal(
    db.prepare("SELECT operation_count FROM sync_events WHERE external_event_id = 'event-stale'").get()!
      .operation_count,
    0,
  );
  db.close();
});

test('transaction rollback removes ledger and state after a post-apply failure', () => {
  const db = database();
  const json = JSON.stringify([
    operation('obs-rollback', '2026-08-31T03:00:00.000Z', 'event-rollback'),
  ]);
  db.exec('BEGIN');
  assert.throws(() => {
    db.prepare(INSERT_OBSERVATIONS_SQL).run(userId, now, userId, json, userId);
    db.prepare(APPLY_OBSERVATIONS_SQL).run(json);
    db.exec('SELECT definitely_missing_column FROM watch_progress');
  });
  db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM progress_observations').get()!.count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM watch_progress').get()!.count, 0);
  db.close();
});
