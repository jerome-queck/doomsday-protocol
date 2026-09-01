import type {
  MarvelItem,
  OperationReceipt,
  ProgressOperation,
  ProgressRow,
  ProgressSource,
  ReceiptOutcome,
} from './marvel-types';

const SOURCES = new Set<ProgressSource>(['manual', 'webmcp', 'jellyfin', 'trakt', 'import']);
const EXTERNAL_SOURCES = new Set<ProgressSource>(['jellyfin', 'trakt', 'import']);
const MODES = new Set(['new', 'doomsday', 'essentials']);
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

type ValidationSuccess = { ok: true; operations: ProgressOperation[] };
type ValidationFailure = { ok: false; error: string; issues: string[] };

export function parseContentKey(contentKey: string) {
  const title = /^title:(\d+)$/.exec(contentKey);
  if (title) {
    const titleNumber = Number(title[1]);
    if (titleNumber < 1 || String(titleNumber) !== title[1]) return null;
    return { kind: 'title' as const, titleNumber, episode: null };
  }
  const episode = /^episode:(\d+):(\d+)$/.exec(contentKey);
  if (episode) {
    const titleNumber = Number(episode[1]);
    const episodeNumber = Number(episode[2]);
    if (
      titleNumber < 1 ||
      episodeNumber < 1 ||
      String(titleNumber) !== episode[1] ||
      String(episodeNumber) !== episode[2]
    ) return null;
    return {
      kind: 'episode' as const,
      titleNumber,
      episode: episodeNumber,
    };
  }
  return null;
}

export function validateOperationBatch(value: unknown, items: MarvelItem[]): ValidationSuccess | ValidationFailure {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return { ok: false, error: 'Invalid operations', issues: ['operations must contain 1 to 100 entries'] };
  }

  const catalog = new Map(items.map((item) => [item.n, item]));
  const seenKeys = new Set<string>();
  const operations: ProgressOperation[] = [];
  const issues: string[] = [];

  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      issues.push(`operations[${index}] must be an object`);
      return;
    }
    const candidate = raw as Record<string, unknown>;
    const contentKey = typeof candidate.contentKey === 'string' ? candidate.contentKey : '';
    const parsed = parseContentKey(contentKey);
    const item = parsed ? catalog.get(parsed.titleNumber) : undefined;
    if (!parsed || !item) {
      issues.push(`operations[${index}].contentKey is not in the catalog`);
      return;
    }
    if (parsed.kind === 'episode' && (!item.episodeCount || parsed.episode! > item.episodeCount)) {
      issues.push(`operations[${index}].contentKey is not a valid catalog episode`);
      return;
    }
    if (seenKeys.has(contentKey)) {
      issues.push(`operations[${index}].contentKey is duplicated in this batch`);
      return;
    }
    seenKeys.add(contentKey);
    if (typeof candidate.watched !== 'boolean') {
      issues.push(`operations[${index}].watched must be boolean`);
      return;
    }
    const source = (candidate.source ?? 'manual') as ProgressSource;
    if (!SOURCES.has(source)) {
      issues.push(`operations[${index}].source is unsupported`);
      return;
    }
    if (EXTERNAL_SOURCES.has(source) && item.episodeCount && parsed.kind === 'title') {
      issues.push(`operations[${index}].contentKey must identify an exact TV episode`);
      return;
    }
    const date = new Date(typeof candidate.observedAt === 'string' ? candidate.observedAt : '');
    if (!Number.isFinite(date.getTime())) {
      issues.push(`operations[${index}].observedAt must be a valid timestamp`);
      return;
    }
    if (date.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
      issues.push(`operations[${index}].observedAt is too far in the future`);
      return;
    }
    const progressSeconds = candidate.progressSeconds ?? 0;
    if (!Number.isInteger(progressSeconds) || Number(progressSeconds) < 0) {
      issues.push(`operations[${index}].progressSeconds must be a non-negative integer`);
      return;
    }
    const baseMinutes =
      parsed.kind === 'episode' && item.episodeCount
        ? item.runtime / item.episodeCount
        : item.runtime;
    const maxProgressSeconds = Math.ceil(
      (parsed.kind === 'episode' ? baseMinutes + Math.max(15, baseMinutes * 0.5) : baseMinutes) * 60,
    );
    if (Number(progressSeconds) > maxProgressSeconds) {
      issues.push(`operations[${index}].progressSeconds exceeds the catalog runtime ceiling`);
      return;
    }
    const externalEventId = candidate.externalEventId;
    if (
      externalEventId !== undefined &&
      (typeof externalEventId !== 'string' ||
        externalEventId.trim().length === 0 ||
        externalEventId.length > 256)
    ) {
      issues.push(`operations[${index}].externalEventId must be 1 to 256 characters`);
      return;
    }
    if (EXTERNAL_SOURCES.has(source) && typeof externalEventId !== 'string') {
      issues.push(`operations[${index}].externalEventId is required for ${source}`);
      return;
    }
    operations.push({
      contentKey,
      watched: candidate.watched,
      progressSeconds: Number(progressSeconds),
      source,
      observedAt: date.toISOString(),
      ...(typeof externalEventId === 'string' ? { externalEventId } : {}),
    });
  });

  if (issues.length) return { ok: false, error: 'Invalid operations', issues };
  return { ok: true, operations };
}

export function validatePreferences(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false as const, error: 'preferences must be an object' };
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (!keys.length || keys.some((key) => key !== 'playbackSpeed' && key !== 'watchMode')) {
    return { ok: false as const, error: 'preferences contains unsupported fields' };
  }
  if (candidate.playbackSpeed !== undefined && candidate.playbackSpeed !== 1 && candidate.playbackSpeed !== 2) {
    return { ok: false as const, error: 'playbackSpeed must be 1 or 2' };
  }
  if (candidate.watchMode !== undefined && (typeof candidate.watchMode !== 'string' || !MODES.has(candidate.watchMode))) {
    return { ok: false as const, error: 'watchMode is unsupported' };
  }
  return {
    ok: true as const,
    preferences: {
      ...(candidate.playbackSpeed !== undefined ? { playbackSpeed: candidate.playbackSpeed as 1 | 2 } : {}),
      ...(candidate.watchMode !== undefined ? { watchMode: candidate.watchMode as 'new' | 'doomsday' | 'essentials' } : {}),
    },
  };
}

export function classifyObservation(
  operation: ProgressOperation,
  current?: ProgressRow,
  duplicateEvent = false,
): OperationReceipt {
  let outcome: ReceiptOutcome = 'applied';
  if (duplicateEvent) {
    outcome = 'duplicate_event';
  } else if (current) {
    const incomingTime = Date.parse(operation.observedAt);
    const currentTime = Date.parse(current.observedAt);
    if (incomingTime < currentTime) outcome = 'stale';
    if (incomingTime === currentTime) {
      const sameState =
        Boolean(current.watched) === operation.watched &&
        Number(current.progressSeconds ?? 0) === Number(operation.progressSeconds ?? 0);
      outcome = sameState ? 'unchanged' : 'equal_timestamp_conflict';
    }
  }
  return {
    contentKey: operation.contentKey,
    outcome,
    observedAt: operation.observedAt,
    ...(current ? { currentObservedAt: current.observedAt } : {}),
  };
}
