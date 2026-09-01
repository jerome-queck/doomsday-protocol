import test from 'node:test';
import assert from 'node:assert/strict';
import { episodeOperations, titleOperations } from '../lib/progress-operations.ts';
import { episodeKey } from '../lib/mission-planner.ts';
import type { MarvelItem, ProgressRow } from '../lib/marvel-types.ts';

const season: MarvelItem = {
  n: 7,
  title: 'Season',
  type: 'tv',
  era: 'A',
  mcuFlag: 'recommended',
  runtime: 90,
  storyOrder: 7,
  episodeCount: 3,
};
const observedAt = '2026-08-31T04:00:00.000Z';
const row = (key: string): ProgressRow => ({
  contentKey: key,
  watched: 1,
  progressSeconds: 0,
  source: 'manual',
  observedAt,
});

test('title operations keep manual and WebMCP season semantics identical', () => {
  const comparable = (operation: ReturnType<typeof titleOperations>[number]) => ({
    contentKey: operation.contentKey,
    watched: operation.watched,
    progressSeconds: operation.progressSeconds,
    observedAt: operation.observedAt,
    externalEventId: operation.externalEventId,
  });
  const manual = titleOperations(season, true, 'manual', observedAt).map(comparable);
  const webmcp = titleOperations(season, true, 'webmcp', observedAt).map(comparable);
  assert.deepEqual(manual, webmcp);
  assert.deepEqual(manual.map((operation) => operation.contentKey), [
    'title:7', 'episode:7:1', 'episode:7:2', 'episode:7:3',
  ]);
});

test('final episode closes a season and unwatching any episode reopens it', () => {
  const rows = {
    [episodeKey(7, 1)]: row(episodeKey(7, 1)),
    [episodeKey(7, 2)]: row(episodeKey(7, 2)),
  };
  const final = episodeOperations(season, 3, true, 'manual', observedAt, rows);
  assert.equal(final[1].watched, true);
  const reopened = episodeOperations(season, 2, false, 'webmcp', observedAt, rows);
  assert.equal(reopened[1].watched, false);
});
