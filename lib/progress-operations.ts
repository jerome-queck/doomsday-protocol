import { episodeKey, isWatched, titleKey, type ProgressMap } from './mission-planner.ts';
import type { MarvelItem, ProgressOperation, ProgressSource } from './marvel-types.ts';

export function titleOperations(
  item: MarvelItem,
  value: boolean,
  source: ProgressSource,
  observedAt: string,
  progressSeconds = 0,
) {
  const operations: ProgressOperation[] = [
    {
      contentKey: titleKey(item.n),
      watched: value,
      progressSeconds: item.episodeCount ? 0 : progressSeconds,
      source,
      observedAt,
    },
  ];
  for (let episode = 1; episode <= (item.episodeCount ?? 0); episode += 1) {
    operations.push({
      contentKey: episodeKey(item.n, episode),
      watched: value,
      progressSeconds: 0,
      source,
      observedAt,
    });
  }
  return operations;
}

export function episodeOperations(
  item: MarvelItem,
  episode: number,
  value: boolean,
  source: ProgressSource,
  observedAt: string,
  rows: ProgressMap,
  progressSeconds = 0,
) {
  const closesSeason =
    value &&
    Array.from({ length: item.episodeCount ?? 0 }, (_, index) => index + 1).every(
      (candidate) => candidate === episode || isWatched(rows, episodeKey(item.n, candidate)),
    );
  return [
    {
      contentKey: episodeKey(item.n, episode),
      watched: value,
      progressSeconds,
      source,
      observedAt,
    },
    {
      contentKey: titleKey(item.n),
      watched: closesSeason,
      progressSeconds: 0,
      source,
      observedAt,
    },
  ] satisfies ProgressOperation[];
}
