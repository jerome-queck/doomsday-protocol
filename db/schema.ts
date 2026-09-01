import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const watchProgress = sqliteTable('watch_progress', { userId: text('user_id').notNull(), contentKey: text('content_key').notNull(), watched: integer('watched', { mode: 'boolean' }).notNull().default(false), progressSeconds: integer('progress_seconds').notNull().default(0), source: text('source').notNull().default('manual'), observedAt: text('observed_at').notNull(), externalEventId: text('external_event_id'), updatedAt: text('updated_at').notNull() }, (table) => [primaryKey({ columns: [table.userId, table.contentKey] }), index('idx_watch_progress_user_watched').on(table.userId, table.watched)]);
export const syncEvents = sqliteTable('sync_events', { id: integer('id').primaryKey({ autoIncrement: true }), userId: text('user_id').notNull(), source: text('source').notNull(), externalEventId: text('external_event_id'), operationCount: integer('operation_count').notNull(), createdAt: text('created_at').notNull() }, (table) => [uniqueIndex('idx_sync_events_source_external').on(table.userId, table.source, table.externalEventId).where(sql`${table.externalEventId} IS NOT NULL`)]);
export const userPreferences = sqliteTable('user_preferences', { userId: text('user_id').primaryKey(), playbackSpeed: real('playback_speed').notNull().default(1), updatedAt: text('updated_at').notNull() });
export const userWatchModes = sqliteTable('user_watch_modes', { userId: text('user_id').primaryKey(), watchMode: text('watch_mode').notNull().default('new'), updatedAt: text('updated_at').notNull() });
export const progressObservations = sqliteTable('progress_observations', {
  observationId: text('observation_id').primaryKey(),
  userId: text('user_id').notNull(),
  contentKey: text('content_key').notNull(),
  watched: integer('watched', { mode: 'boolean' }).notNull(),
  progressSeconds: integer('progress_seconds').notNull().default(0),
  source: text('source').notNull(),
  observedAt: text('observed_at').notNull(),
  externalEventId: text('external_event_id'),
  idempotencyKey: text('idempotency_key'),
  receivedAt: text('received_at').notNull(),
  outcome: text('outcome').notNull(),
}, (table) => [
  index('idx_progress_observations_user_received').on(table.userId, table.receivedAt),
  uniqueIndex('idx_progress_observations_idempotency').on(table.userId, table.idempotencyKey).where(sql`${table.idempotencyKey} IS NOT NULL`),
]);
