import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionPlan, episodeKey, itemComplete, missionMetrics, titleKey } from '../lib/mission-planner.ts';
import type { MarvelItem, ProgressRow } from '../lib/marvel-types.ts';

const items: MarvelItem[] = [
  { n: 1, title: 'Film', type: 'movie', era: 'A', mcuFlag: 'essential', runtime: 120, storyOrder: 1 },
  { n: 2, title: 'Season', type: 'tv', era: 'A', mcuFlag: 'recommended', runtime: 90, storyOrder: 2, episodeCount: 3 },
];

const row = (contentKey: string, watched: boolean, progressSeconds = 0): ProgressRow => ({
  contentKey, watched: watched ? 1 : 0, progressSeconds, source: 'manual', observedAt: '2026-08-31T00:00:00.000Z',
});

test('TV completion requires every exact episode, not a contradictory title row', () => {
  const rows = { [titleKey(2)]: row(titleKey(2), true), [episodeKey(2, 1)]: row(episodeKey(2, 1), true) };
  assert.equal(itemComplete(items[1], rows), false);
  rows[episodeKey(2, 2)] = row(episodeKey(2, 2), true);
  rows[episodeKey(2, 3)] = row(episodeKey(2, 3), true);
  assert.equal(itemComplete(items[1], rows), true);
});

test('session planner preserves chronology and honors speed, resume, and budget', () => {
  const rows = { [titleKey(1)]: row(titleKey(1), false, 30 * 60) };
  const result = buildSessionPlan(items, rows, 2, 80);
  assert.equal(result.units[0].key, 'title:1');
  assert.equal(result.units[0].remainingMinutes, 45);
  assert.equal(result.units[1].key, 'episode:2:1');
  assert.equal(result.totalMinutes, 75);
});

test('mission metrics count in-progress minutes without claiming completion', () => {
  const rows = { [titleKey(1)]: row(titleKey(1), false, 30 * 60) };
  const metrics = missionMetrics(items, rows, 1, 100);
  assert.equal(metrics.completedTitles, 0);
  assert.equal(metrics.completedMinutes, 30);
  assert.equal(metrics.remainingHours, 3);
});

test('session planner never exceeds the available budget', () => {
  const result = buildSessionPlan(items, {}, 1, 15);
  assert.equal(result.units.length, 0);
  assert.equal(result.totalMinutes, 0);
  assert.equal(result.overflowUnit?.key, 'title:1');
  assert.equal(result.overflowMinutes, 105);
});
