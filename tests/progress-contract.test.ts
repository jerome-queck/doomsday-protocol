import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyObservation, validateOperationBatch } from '../lib/progress-contract.ts';
import type { MarvelItem, ProgressOperation, ProgressRow } from '../lib/marvel-types.ts';

const catalog: MarvelItem[] = [
  { n: 1, title: 'Film', type: 'movie', era: 'A', mcuFlag: 'essential', runtime: 120, storyOrder: 1 },
  { n: 2, title: 'Season', type: 'tv', era: 'A', mcuFlag: 'recommended', runtime: 90, storyOrder: 2, episodeCount: 3 },
];

test('catalog validation canonicalizes exact operations', () => {
  const result = validateOperationBatch([
    { contentKey: 'episode:2:3', watched: true, source: 'jellyfin', observedAt: '2026-08-30T10:00:00+08:00', externalEventId: 'jf-1' },
  ], catalog);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.operations[0].observedAt, '2026-08-30T02:00:00.000Z');
  assert.equal(result.operations[0].progressSeconds, 0);
});

test('catalog validation rejects noncanonical keys, poisoned time, and impossible resume state', () => {
  for (const contentKey of ['title:01', 'episode:2:0', 'episode:02:1']) {
    const result = validateOperationBatch([
      { contentKey, watched: true, observedAt: '2026-08-30T02:00:00.000Z' },
    ], catalog);
    assert.equal(result.ok, false, contentKey);
  }

  const future = validateOperationBatch([
    { contentKey: 'title:1', watched: true, observedAt: '2099-01-01T00:00:00.000Z' },
  ], catalog);
  assert.equal(future.ok, false);

  const oversized = validateOperationBatch([
    { contentKey: 'title:1', watched: false, progressSeconds: 120 * 60 + 1, observedAt: '2026-08-30T02:00:00.000Z' },
  ], catalog);
  assert.equal(oversized.ok, false);
});

test('external observations require stable event identity', () => {
  const result = validateOperationBatch([
    { contentKey: 'title:1', watched: true, source: 'trakt', observedAt: '2026-08-30T02:00:00.000Z' },
  ], catalog);
  assert.equal(result.ok, false);

  const seasonTitle = validateOperationBatch([
    { contentKey: 'title:2', watched: true, source: 'jellyfin', observedAt: '2026-08-30T02:00:00.000Z', externalEventId: 'jf-season' },
  ], catalog);
  assert.equal(seasonTitle.ok, false);
});

test('catalog validation rejects unknown episodes and duplicate keys', () => {
  const badEpisode = validateOperationBatch([
    { contentKey: 'episode:2:4', watched: true, observedAt: '2026-08-30T02:00:00.000Z' },
  ], catalog);
  assert.equal(badEpisode.ok, false);

  const duplicate = validateOperationBatch([
    { contentKey: 'title:1', watched: true, observedAt: '2026-08-30T02:00:00.000Z' },
    { contentKey: 'title:1', watched: false, observedAt: '2026-08-31T02:00:00.000Z' },
  ], catalog);
  assert.equal(duplicate.ok, false);
});

test('observation classifier fails closed on stale and equal-time conflict', () => {
  const current: ProgressRow = {
    contentKey: 'title:1', watched: 1, progressSeconds: 0, source: 'manual', observedAt: '2026-08-31T02:00:00.000Z',
  };
  const operation = (observedAt: string, watched: boolean): ProgressOperation => ({
    contentKey: 'title:1', watched, progressSeconds: 0, source: 'import', observedAt,
  });
  assert.equal(classifyObservation(operation('2026-08-30T02:00:00.000Z', false), current).outcome, 'stale');
  assert.equal(classifyObservation(operation('2026-08-31T02:00:00.000Z', false), current).outcome, 'equal_timestamp_conflict');
  assert.equal(classifyObservation(operation('2026-08-31T02:00:00.000Z', true), current).outcome, 'unchanged');
  assert.equal(classifyObservation(operation('2026-09-01T02:00:00.000Z', false), current).outcome, 'applied');
  assert.equal(classifyObservation(operation('2026-09-01T02:00:00.000Z', false), current, true).outcome, 'duplicate_event');
});
