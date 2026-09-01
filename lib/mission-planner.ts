import type { MarvelItem, ProgressRow } from './marvel-types';

export type ProgressMap = Record<string, ProgressRow>;

export type SessionUnit = {
  key: string;
  titleNumber: number;
  title: string;
  episode: number | null;
  baseMinutes: number;
  remainingMinutes: number;
  resumeSeconds: number;
};

export const titleKey = (number: number) => `title:${number}`;
export const episodeKey = (number: number, episode: number) => `episode:${number}:${episode}`;
export const isWatched = (rows: ProgressMap, key: string) => Boolean(rows[key]?.watched);

const progressMinutes = (rows: ProgressMap, key: string, ceiling: number) =>
  Math.min(ceiling, Math.max(0, Number(rows[key]?.progressSeconds ?? 0) / 60));

export function itemComplete(item: MarvelItem, rows: ProgressMap) {
  if (item.episodeCount) {
    return Array.from({ length: item.episodeCount }, (_, index) =>
      isWatched(rows, episodeKey(item.n, index + 1)),
    ).every(Boolean);
  }
  return isWatched(rows, titleKey(item.n));
}

export function watchedMinutes(item: MarvelItem, rows: ProgressMap) {
  if (item.episodeCount) {
    const perEpisode = item.runtime / item.episodeCount;
    return Array.from({ length: item.episodeCount }, (_, index) => {
      const key = episodeKey(item.n, index + 1);
      return isWatched(rows, key) ? perEpisode : progressMinutes(rows, key, perEpisode);
    }).reduce((total, value) => total + value, 0);
  }
  const key = titleKey(item.n);
  return isWatched(rows, key) ? item.runtime : progressMinutes(rows, key, item.runtime);
}

export function nextEpisode(item: MarvelItem, rows: ProgressMap) {
  if (!item.episodeCount) return null;
  return (
    Array.from({ length: item.episodeCount }, (_, index) => index + 1).find(
      (episode) => !isWatched(rows, episodeKey(item.n, episode)),
    ) ?? null
  );
}

export function buildSessionPlan(
  items: MarvelItem[],
  rows: ProgressMap,
  playbackSpeed: 1 | 2,
  availableMinutes: number,
  maxItems = 8,
) {
  const queue: SessionUnit[] = [];

  for (const item of items) {
    if (itemComplete(item, rows)) continue;
    if (item.episodeCount) {
      const baseMinutes = item.runtime / item.episodeCount;
      for (let episode = 1; episode <= item.episodeCount; episode += 1) {
        const key = episodeKey(item.n, episode);
        if (isWatched(rows, key)) continue;
        const resumeSeconds = Math.max(0, Number(rows[key]?.progressSeconds ?? 0));
        queue.push({
          key,
          titleNumber: item.n,
          title: item.title,
          episode,
          baseMinutes,
          remainingMinutes: Math.max(0, baseMinutes - resumeSeconds / 60) / playbackSpeed,
          resumeSeconds,
        });
      }
    } else {
      const key = titleKey(item.n);
      const resumeSeconds = Math.max(0, Number(rows[key]?.progressSeconds ?? 0));
      queue.push({
        key,
        titleNumber: item.n,
        title: item.title,
        episode: null,
        baseMinutes: item.runtime,
        remainingMinutes: Math.max(0, item.runtime - resumeSeconds / 60) / playbackSpeed,
        resumeSeconds,
      });
    }
  }

  const selected: SessionUnit[] = [];
  let totalMinutes = 0;
  for (const unit of queue) {
    if (selected.length >= maxItems) break;
    if (totalMinutes + unit.remainingMinutes > availableMinutes) break;
    selected.push(unit);
    totalMinutes += unit.remainingMinutes;
  }

  const overflowUnit = selected.length === 0 ? (queue[0] ?? null) : null;
  return {
    units: selected,
    totalMinutes,
    availableMinutes,
    overflowUnit,
    overflowMinutes: overflowUnit
      ? Math.max(0, overflowUnit.remainingMinutes - availableMinutes)
      : 0,
  };
}

export function missionMetrics(
  items: MarvelItem[],
  rows: ProgressMap,
  playbackSpeed: 1 | 2,
  daysRemaining: number,
) {
  const totalMinutes = items.reduce((total, item) => total + item.runtime, 0);
  const completedMinutes = items.reduce((total, item) => total + watchedMinutes(item, rows), 0);
  const completedTitles = items.filter((item) => itemComplete(item, rows)).length;
  const totalEpisodes = items.reduce((total, item) => total + (item.episodeCount ?? 0), 0);
  const completedEpisodes = items.reduce(
    (total, item) =>
      total +
      Array.from({ length: item.episodeCount ?? 0 }, (_, index) =>
        isWatched(rows, episodeKey(item.n, index + 1)),
      ).filter(Boolean).length,
    0,
  );
  const remainingHours = Math.max(0, totalMinutes - completedMinutes) / (60 * playbackSpeed);

  return {
    totalMinutes,
    completedMinutes,
    completedTitles,
    totalTitles: items.length,
    totalEpisodes,
    completedEpisodes,
    percent: totalMinutes ? (completedMinutes / totalMinutes) * 100 : 0,
    remainingHours,
    dailyHoursNeeded: daysRemaining > 0 ? remainingHours / daysRemaining : remainingHours,
  };
}
