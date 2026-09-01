export type Grade = 'essential' | 'recommended' | 'optional' | 'unconfirmed';
export type ModeKey = 'new' | 'doomsday' | 'essentials';
export type ProgressSource = 'manual' | 'webmcp' | 'jellyfin' | 'trakt' | 'import';

export type MarvelItem = {
  n: number;
  title: string;
  type: string;
  era: string;
  mcuFlag: Grade;
  runtime: number;
  instruction?: string;
  context?: string;
  releaseDate?: string;
  storyOrder: number;
  tmdbId?: number;
  episodeCount?: number;
  poster?: string;
  posterUrl?: string;
};

export type ProgressRow = {
  contentKey: string;
  watched: number | boolean;
  progressSeconds?: number;
  source: ProgressSource;
  observedAt: string;
  externalEventId?: string | null;
  updatedAt?: string;
};

export type ProgressOperation = {
  contentKey: string;
  watched: boolean;
  progressSeconds?: number;
  source: ProgressSource;
  observedAt: string;
  externalEventId?: string;
};

export type ReceiptOutcome =
  | 'applied'
  | 'duplicate_event'
  | 'unchanged'
  | 'stale'
  | 'equal_timestamp_conflict';

export type OperationReceipt = {
  contentKey: string;
  outcome: ReceiptOutcome;
  observedAt: string;
  currentObservedAt?: string;
};
