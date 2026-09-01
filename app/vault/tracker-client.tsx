'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import modesData from '@/data/modes.json';
import {
  buildSessionPlan,
  episodeKey,
  isWatched,
  itemComplete,
  missionMetrics,
  nextEpisode,
  titleKey,
  type ProgressMap,
} from '@/lib/mission-planner';
import { episodeOperations, titleOperations } from '@/lib/progress-operations';
import type {
  Grade,
  MarvelItem,
  ModeKey,
  OperationReceipt,
  ProgressOperation,
  ProgressRow,
} from '@/lib/marvel-types';

type Props = {
  items: MarvelItem[];
  displayName: string;
  signOutPath: string;
  daysRemaining: number;
};

type HistoryEntry = { item: MarvelItem; watchedAt: number | null };
type StatusFilter = 'all' | 'remaining' | 'complete';
type FormatFilter = 'all' | 'movie' | 'tv' | 'special';
type Notice = { tone: 'success' | 'warning' | 'error'; message: string; undo?: () => void };
type SyncSummary = {
  counts: Array<{ source: string; outcome: string; count: number }>;
  latest: { source: string; observedAt: string; receivedAt: string } | null;
  legacyRows: number;
};
type ProgressResponse = {
  preview: boolean;
  previewToken?: string;
  applied: number;
  rejected: number;
  receipts: OperationReceipt[];
  progress?: ProgressRow[];
  syncSummary?: SyncSummary;
};

const placeholder = 'https://image.tmdb.org/t/p/w500/vSNxAJTlD0r02V9sPYpOjqDZXUK.jpg';
const doomsdayDate = new Date('2026-12-18T00:00:00+08:00');
const modeOptions = Object.entries(modesData.modes) as Array<
  [
    ModeKey,
    {
      label: string;
      description: string;
      itemNumbers: number[];
      gradeByNumber?: Record<string, Grade>;
    },
  ]
>;

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');
const posterSrc = (item: MarvelItem, size: 'w342' | 'w500' = 'w500') =>
  (item.poster ?? item.posterUrl ?? placeholder).replace(/\/t\/p\/w\d+\//, '/t/p/' + size + '/');
const gradeForMode = (item: MarvelItem, mode: ModeKey): Grade =>
  mode === 'doomsday'
    ? ((modesData.modes.doomsday.gradeByNumber as Record<string, Grade>)[String(item.n)] ?? 'optional')
    : mode === 'essentials'
      ? 'essential'
      : item.mcuFlag;
const historyDate = (timestamp: number | null) =>
  timestamp === null
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-SG', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(timestamp));
const compactDate = (date: Date) =>
  new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
const formatDuration = (minutes: number) => {
  if (minutes < 60) return Math.max(1, Math.round(minutes)) + ' min';
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder ? hours + 'h ' + remainder + 'm' : hours + 'h';
};
const eraId = (era: string) =>
  'era-' +
  era
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function rowMap(rows: ProgressRow[]) {
  return Object.fromEntries(rows.map((row) => [row.contentKey, row])) as ProgressMap;
}

export type { MarvelItem };

export default function TrackerClient({ items, displayName, signOutPath, daysRemaining }: Props) {
  const [rows, setRows] = useState<ProgressMap>({});
  const [mode, setModeState] = useState<ModeKey>('new');
  const [speed, setSpeedState] = useState<1 | 2>(1);
  const [dailyBudget, setDailyBudgetState] = useState(90);
  const [spoilers, setSpoilers] = useState(false);
  const [query, setQuery] = useState('');
  const [commandQuery, setCommandQuery] = useState('');
  const [tier, setTier] = useState<'all' | 'essential' | 'recommended' | 'optional'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [detailNumber, setDetailNumber] = useState<number | null>(null);
  const [openEras, setOpenEras] = useState<Set<string>>(new Set());
  const [filteredEraState, setFilteredEraState] = useState<{
    signature: string;
    closed: Set<string>;
  }>({ signature: '', closed: new Set() });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [intelOpen, setIntelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary>({
    counts: [],
    latest: null,
    legacyRows: 0,
  });

  const rowsRef = useRef(rows);
  const modeRef = useRef(mode);
  const speedRef = useRef(speed);
  const budgetRef = useRef(dailyBudget);
  const syncRef = useRef<SyncSummary>(syncSummary);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const paletteDialog = useRef<HTMLDialogElement>(null);
  const intelDialog = useRef<HTMLDialogElement>(null);
  const detailDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    rowsRef.current = rows;
    modeRef.current = mode;
    speedRef.current = speed;
    budgetRef.current = dailyBudget;
  }, [rows, mode, speed, dailyBudget]);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setFatalError(null);
    try {
      const response = await fetch('/api/progress', { cache: 'no-store' });
      if (!response.ok) throw new Error('Your saved watch state could not be loaded.');
      const payload = (await response.json()) as {
        progress: ProgressRow[];
        preferences?: { playbackSpeed?: number; watchMode?: string };
        syncSummary?: SyncSummary;
      };
      const nextRows = rowMap(payload.progress ?? []);
      setRows(nextRows);
      rowsRef.current = nextRows;
      const nextSpeed = payload.preferences?.playbackSpeed === 2 ? 2 : 1;
      const nextMode = ['new', 'doomsday', 'essentials'].includes(
        payload.preferences?.watchMode ?? '',
      )
        ? (payload.preferences!.watchMode as ModeKey)
        : 'new';
      setSpeedState(nextSpeed);
      setModeState(nextMode);
      speedRef.current = nextSpeed;
      modeRef.current = nextMode;
      const initialNumbers = new Set(modesData.modes[nextMode].itemNumbers);
      const initialNext = items.find(
        (item) => initialNumbers.has(item.n) && !itemComplete(item, nextRows),
      );
      setOpenEras(initialNext ? new Set([initialNext.era]) : new Set());
      const nextSyncSummary = payload.syncSummary ?? { counts: [], latest: null, legacyRows: 0 };
      setSyncSummary(nextSyncSummary);
      syncRef.current = nextSyncSummary;
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : 'Your mission state is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [items]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProgress();
      const stored = Number(window.localStorage.getItem('doomsday:daily-budget'));
      if (Number.isFinite(stored) && stored >= 15 && stored <= 480) {
        setDailyBudgetState(stored);
      }
      setSpoilers(window.localStorage.getItem('doomsday:spoilers') === 'revealed');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProgress]);

  const setDailyBudget = useCallback((minutes: number) => {
    const safe = Math.max(15, Math.min(480, Math.round(minutes / 15) * 15));
    setDailyBudgetState(safe);
    budgetRef.current = safe;
    window.localStorage.setItem('doomsday:daily-budget', String(safe));
    return safe;
  }, []);

  const toggleSpoilers = useCallback(() => {
    setSpoilers((current) => {
      const nextValue = !current;
      window.localStorage.setItem('doomsday:spoilers', nextValue ? 'revealed' : 'sealed');
      return nextValue;
    });
  }, []);

  const enqueueWrite = useCallback(<T,>(work: () => Promise<T>) => {
    const result = writeQueueRef.current.then(work, work);
    writeQueueRef.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);

  const persistPreferences = useCallback(async (preferences: Record<string, string | number>) => {
    const response = await fetch('/api/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preferences }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? 'Preference could not be saved.');
    }
    return response.json();
  }, []);

  const setSpeed = useCallback(
    (value: 1 | 2) =>
      enqueueWrite(async () => {
        const previous = speedRef.current;
        setSpeedState(value);
        speedRef.current = value;
        try {
          await persistPreferences({ playbackSpeed: value });
        } catch (error) {
          setSpeedState(previous);
          speedRef.current = previous;
          setNotice({
            tone: 'error',
            message: error instanceof Error ? error.message : 'Watch speed was not saved.',
          });
          throw error;
        }
      }),
    [enqueueWrite, persistPreferences],
  );

  const setMode = useCallback(
    (value: ModeKey) =>
      enqueueWrite(async () => {
        const previous = modeRef.current;
        setModeState(value);
        modeRef.current = value;
        setDetailNumber(null);
        const targetNumbers = new Set(modesData.modes[value].itemNumbers);
        const targetNext = items.find(
          (item) => targetNumbers.has(item.n) && !itemComplete(item, rowsRef.current),
        );
        setOpenEras(targetNext ? new Set([targetNext.era]) : new Set());
        try {
          await persistPreferences({ watchMode: value });
        } catch (error) {
          setModeState(previous);
          modeRef.current = previous;
          setNotice({
            tone: 'error',
            message: error instanceof Error ? error.message : 'Watch mode was not saved.',
          });
          throw error;
        }
      }),
    [enqueueWrite, items, persistPreferences],
  );

  const submitOperations = useCallback(
    (
      operations: ProgressOperation[],
      options: { preview?: boolean; optimistic?: boolean; previewToken?: string } = {},
    ): Promise<ProgressResponse> =>
      enqueueWrite(async () => {
        const preview = options.preview ?? false;
        const optimistic = options.optimistic ?? !preview;
        const previousRows = rowsRef.current;
        if (optimistic) {
          const nextRows = { ...previousRows };
          for (const operation of operations) {
            const current = nextRows[operation.contentKey];
            if (!current || Date.parse(operation.observedAt) > Date.parse(current.observedAt)) {
              nextRows[operation.contentKey] = {
                ...operation,
                watched: operation.watched ? 1 : 0,
              };
            }
          }
          rowsRef.current = nextRows;
          setRows(nextRows);
        }
        setBusy(true);
        try {
          const response = await fetch('/api/progress', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              operations,
              preview,
              ...(options.previewToken ? { previewToken: options.previewToken } : {}),
            }),
          });
          const payload = (await response.json().catch(() => null)) as
            | (ProgressResponse & { error?: string; issues?: string[] })
            | null;
          if (!response.ok || !payload) {
            throw new Error(payload?.issues?.[0] ?? payload?.error ?? 'Progress was not saved.');
          }
          if (!preview && payload.progress) {
            const canonicalRows = rowMap(payload.progress);
            rowsRef.current = canonicalRows;
            setRows(canonicalRows);
            if (payload.syncSummary) {
              setSyncSummary(payload.syncSummary);
              syncRef.current = payload.syncSummary;
            }
          }
          if (!preview && payload.rejected > 0) {
            setNotice({
              tone: 'warning',
              message:
                payload.applied +
                ' of ' +
                operations.length +
                ' updates saved; ' +
                payload.rejected +
                ' were stale, duplicate, or conflicting.',
            });
          }
          return payload;
        } catch (error) {
          let reconciled = false;
          if (!preview) {
            try {
              const response = await fetch('/api/progress', { cache: 'no-store' });
              if (response.ok) {
                const payload = (await response.json()) as {
                  progress: ProgressRow[];
                  syncSummary?: SyncSummary;
                };
                const canonicalRows = rowMap(payload.progress ?? []);
                rowsRef.current = canonicalRows;
                setRows(canonicalRows);
                if (payload.syncSummary) {
                  setSyncSummary(payload.syncSummary);
                  syncRef.current = payload.syncSummary;
                }
                reconciled = true;
              }
            } catch {
              // The original error is more useful; local rollback remains the fallback.
            }
          }
          if (optimistic && !reconciled) {
            rowsRef.current = previousRows;
            setRows(previousRows);
          }
          setNotice({
            tone: 'error',
            message:
              (error instanceof Error ? error.message : 'Progress was not saved.') +
              (reconciled ? ' Saved state was reloaded.' : ''),
          });
          throw error;
        } finally {
          setBusy(false);
        }
      }),
    [enqueueWrite],
  );

  const modeNumbers = useMemo(() => new Set(modesData.modes[mode].itemNumbers), [mode]);
  const missionItems = useMemo(
    () => items.filter((item) => modeNumbers.has(item.n)),
    [items, modeNumbers],
  );
  const metrics = useMemo(
    () => missionMetrics(missionItems, rows, speed, daysRemaining),
    [missionItems, rows, speed, daysRemaining],
  );
  const next = useMemo(
    () => missionItems.find((item) => !itemComplete(item, rows)) ?? null,
    [missionItems, rows],
  );
  const activeItem = next ?? missionItems.at(-1) ?? items[0];
  const activeEpisode = next ? nextEpisode(next, rows) : null;
  const activeKey = next
    ? activeEpisode
      ? episodeKey(next.n, activeEpisode)
      : titleKey(next.n)
    : null;
  const activeResumeSeconds = activeKey ? Number(rows[activeKey]?.progressSeconds ?? 0) : 0;
  const plan = useMemo(
    () => buildSessionPlan(missionItems, rows, speed, dailyBudget, 6),
    [missionItems, rows, speed, dailyBudget],
  );
  const finishDays = dailyBudget > 0 ? (metrics.remainingHours * 60) / dailyBudget : Infinity;
  const bufferDays = Math.floor(daysRemaining - finishDays);
  const todayApprox = doomsdayDate.getTime() - daysRemaining * 86400000;
  const projectedFinish = new Date(todayApprox + finishDays * 86400000);

  const watchedAtForItem = useCallback(
    (item: MarvelItem) => {
      const keys = [
        titleKey(item.n),
        ...(item.episodeCount
          ? Array.from({ length: item.episodeCount }, (_, index) => episodeKey(item.n, index + 1))
          : []),
      ];
      const timestamps = keys
        .map((key) => {
          const row = rows[key];
          if (!row || !Boolean(row.watched)) return null;
          const parsed = Date.parse(row.observedAt);
          return Number.isFinite(parsed) ? parsed : null;
        })
        .filter((value): value is number => value !== null);
      return timestamps.length ? Math.max(...timestamps) : null;
    },
    [rows],
  );

  const history = useMemo<HistoryEntry[]>(
    () =>
      missionItems
        .filter((item) => itemComplete(item, rows))
        .map((item) => ({ item, watchedAt: watchedAtForItem(item) }))
        .sort(
          (left, right) =>
            (right.watchedAt ?? -1) - (left.watchedAt ?? -1) || right.item.n - left.item.n,
        ),
    [missionItems, rows, watchedAtForItem],
  );

  const modeMetrics = useMemo(
    () =>
      modeOptions.map(([key, value]) => {
        const scoped = items.filter((item) => value.itemNumbers.includes(item.n));
        return { key, label: value.label, ...missionMetrics(scoped, rows, speed, daysRemaining) };
      }),
    [items, rows, speed, daysRemaining],
  );

  const filtered = useMemo(
    () =>
      missionItems.filter((item) => {
        const complete = itemComplete(item, rows);
        return (
          (tier === 'all' || gradeForMode(item, mode) === tier) &&
          (statusFilter === 'all' ||
            (statusFilter === 'complete' ? complete : !complete)) &&
          (formatFilter === 'all' || item.type === formatFilter) &&
          item.title.toLowerCase().includes(query.trim().toLowerCase())
        );
      }),
    [missionItems, rows, tier, statusFilter, formatFilter, query, mode],
  );
  const grouped = useMemo(
    () =>
      filtered.reduce<Record<string, MarvelItem[]>>((result, item) => {
        (result[item.era] ??= []).push(item);
        return result;
      }, {}),
    [filtered],
  );
  const allEraStats = useMemo(
    () =>
      missionItems.reduce<
        Array<{ era: string; items: MarvelItem[]; completed: number; percent: number }>
      >((result, item) => {
        let entry = result.find((candidate) => candidate.era === item.era);
        if (!entry) {
          entry = { era: item.era, items: [], completed: 0, percent: 0 };
          result.push(entry);
        }
        entry.items.push(item);
        if (itemComplete(item, rows)) entry.completed += 1;
        entry.percent = (entry.completed / entry.items.length) * 100;
        return result;
      }, []),
    [missionItems, rows],
  );

  const detailItem = useMemo(
    () => items.find((item) => item.n === detailNumber) ?? null,
    [items, detailNumber],
  );
  const commandResults = useMemo(() => {
    const needle = commandQuery.trim().toLowerCase();
    return missionItems
      .filter((item) => !needle || item.title.toLowerCase().includes(needle))
      .sort((left, right) => {
        const leftDone = itemComplete(left, rows) ? 1 : 0;
        const rightDone = itemComplete(right, rows) ? 1 : 0;
        return leftDone - rightDone || left.n - right.n;
      })
      .slice(0, 7);
  }, [commandQuery, missionItems, rows]);

  const openItem = useCallback((item: MarvelItem) => {
    setDetailNumber(item.n);
  }, []);

  const jumpToEra = useCallback((era: string) => {
    setOpenEras((current) => new Set([...current, era]));
    requestAnimationFrame(() =>
      document.getElementById(eraId(era))?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }, []);

  const toggleItem = useCallback(
    (item: MarvelItem) => {
      if (busy) return;
      const value = !itemComplete(item, rowsRef.current);
      const observedAt = new Date().toISOString();
      const operations = titleOperations(item, value, 'manual', observedAt);
      void submitOperations(operations)
        .then((result) => {
          if (result.rejected > 0 || result.applied !== operations.length) return;
          setNotice({
            tone: 'success',
            message: value ? item.title + ' marked complete.' : item.title + ' restored to the queue.',
            undo: () => {
              const undo = titleOperations(item, !value, 'manual', new Date().toISOString());
              void submitOperations(undo).catch(() => undefined);
            },
          });
        })
        .catch(() => undefined);
    },
    [busy, submitOperations],
  );

  const toggleEpisode = useCallback(
    (item: MarvelItem, episode: number) => {
      if (busy) return;
      const value = !isWatched(rowsRef.current, episodeKey(item.n, episode));
      const operations = episodeOperations(
        item,
        episode,
        value,
        'manual',
        new Date().toISOString(),
        rowsRef.current,
      );
      void submitOperations(operations)
        .then((result) => {
          if (result.rejected > 0 || result.applied !== operations.length) return;
          setNotice({
            tone: 'success',
            message:
              item.title +
              ' · Episode ' +
              episode +
              (value ? ' marked watched.' : ' returned to queue.'),
            undo: () => {
              const undo = episodeOperations(
                item,
                episode,
                !value,
                'manual',
                new Date().toISOString(),
                rowsRef.current,
              );
              void submitOperations(undo).catch(() => undefined);
            },
          });
        })
        .catch(() => undefined);
    },
    [busy, submitOperations],
  );

  useEffect(() => {
    const dialog = paletteDialog.current;
    if (!dialog) return;
    if (paletteOpen && !dialog.open) dialog.showModal();
    if (!paletteOpen && dialog.open) dialog.close();
  }, [paletteOpen]);
  useEffect(() => {
    const dialog = intelDialog.current;
    if (!dialog) return;
    if (intelOpen && !dialog.open) dialog.showModal();
    if (!intelOpen && dialog.open) dialog.close();
  }, [intelOpen]);
  useEffect(() => {
    const dialog = detailDialog.current;
    if (!dialog) return;
    if (detailItem && !dialog.open) dialog.showModal();
    if (!detailItem && dialog.open) dialog.close();
  }, [detailItem]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key === '/' && !isTyping) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const getLiveStatus = useCallback(() => {
    const currentMode = modeRef.current;
    const numbers = new Set(modesData.modes[currentMode].itemNumbers);
    const scoped = items.filter((item) => numbers.has(item.n));
    const liveMetrics = missionMetrics(scoped, rowsRef.current, speedRef.current, daysRemaining);
    const liveNext = scoped.find((item) => !itemComplete(item, rowsRef.current)) ?? null;
    return {
      hydrated: !loading && !fatalError,
      mode: currentMode,
      completed: liveMetrics.completedTitles,
      total: liveMetrics.totalTitles,
      episodesWatched: liveMetrics.completedEpisodes,
      totalEpisodes: liveMetrics.totalEpisodes,
      percent: Number(liveMetrics.percent.toFixed(1)),
      next: liveNext
        ? { n: liveNext.n, title: liveNext.title, episode: nextEpisode(liveNext, rowsRef.current) }
        : { complete: true },
      playbackSpeed: speedRef.current,
      dailyBudgetMinutes: budgetRef.current,
      remainingHours: Number(liveMetrics.remainingHours.toFixed(1)),
      dailyHoursNeeded: Number(liveMetrics.dailyHoursNeeded.toFixed(2)),
      daysRemaining,
      targetDate: '2026-12-18',
    };
  }, [daysRemaining, fatalError, items, loading]);

  const getLiveModes = useCallback(
    () =>
      modeOptions.map(([key, value]) => {
        const scoped = items.filter((item) => value.itemNumbers.includes(item.n));
        const liveMetrics = missionMetrics(
          scoped,
          rowsRef.current,
          speedRef.current,
          daysRemaining,
        );
        return {
          key,
          label: value.label,
          total: liveMetrics.totalTitles,
          completed: liveMetrics.completedTitles,
          percent: Number(liveMetrics.percent.toFixed(1)),
          remainingHours: Number(liveMetrics.remainingHours.toFixed(1)),
          dailyHoursNeeded: Number(liveMetrics.dailyHoursNeeded.toFixed(2)),
          selected: key === modeRef.current,
        };
      }),
    [daysRemaining, items],
  );

  useEffect(() => {
    if (loading || fatalError) return;
    const modelContext = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: {
              name: string;
              title: string;
              description: string;
              inputSchema: unknown;
              execute: (input: never) => unknown;
            },
            options?: { signal: AbortSignal },
          ) => Promise<void>;
        };
      }
    ).modelContext;
    if (!modelContext) return;
    const controller = new AbortController();
    const register = (tool: Parameters<typeof modelContext.registerTool>[0]) =>
      modelContext.registerTool(tool, { signal: controller.signal });

    void register({
      name: 'get_marvel_watch_status',
      title: 'Read Marvel watch status',
      description:
        'Returns saved completion, exact next title or episode, selected speed, daily budget, remaining runtime, and Doomsday pace.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => getLiveStatus(),
    });
    void register({
      name: 'get_marvel_watch_modes',
      title: 'Compare Marvel watch modes',
      description: 'Compares independent progress and pace for the 165, 72, and 60 title modes.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => getLiveModes(),
    });
    void register({
      name: 'get_marvel_watch_plan',
      title: 'Plan a Marvel watch session',
      description:
        'Builds the next chronological session from exact unfinished titles or episodes and an available-minute budget.',
      inputSchema: {
        type: 'object',
        properties: {
          availableMinutes: { type: 'integer', minimum: 15, maximum: 480 },
          maxItems: { type: 'integer', minimum: 1, maximum: 12 },
        },
        additionalProperties: false,
      },
      execute: (input: { availableMinutes?: number; maxItems?: number }) => {
        const currentMode = modeRef.current;
        const numbers = new Set(modesData.modes[currentMode].itemNumbers);
        const scoped = items.filter((item) => numbers.has(item.n));
        const result = buildSessionPlan(
          scoped,
          rowsRef.current,
          speedRef.current,
          input.availableMinutes ?? budgetRef.current,
          input.maxItems ?? 8,
        );
        return {
          mode: currentMode,
          playbackSpeed: speedRef.current,
          ...result,
          totalMinutes: Number(result.totalMinutes.toFixed(1)),
          units: result.units.map((unit) => ({
            ...unit,
            remainingMinutes: Number(unit.remainingMinutes.toFixed(1)),
          })),
        };
      },
    });
    void register({
      name: 'get_marvel_progress_provenance',
      title: 'Read Marvel progress provenance',
      description:
        'Returns observation-ledger source and outcome counts, retained legacy rows, and the latest observation.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => syncRef.current,
    });
    void register({
      name: 'set_marvel_watch_mode',
      title: 'Select Marvel watch mode',
      description: 'Selects the active watch list and persists it.',
      inputSchema: {
        type: 'object',
        properties: { mode: { type: 'string', enum: ['new', 'doomsday', 'essentials'] } },
        required: ['mode'],
        additionalProperties: false,
      },
      execute: async (input: { mode: ModeKey }) => {
        await setMode(input.mode);
        return { mode: input.mode, total: modesData.modes[input.mode].itemNumbers.length };
      },
    });
    void register({
      name: 'set_marvel_daily_budget',
      title: 'Set Marvel daily watch budget',
      description: 'Sets this device daily viewing budget in 15-minute increments for session and finish forecasts.',
      inputSchema: {
        type: 'object',
        properties: { minutes: { type: 'integer', minimum: 15, maximum: 480 } },
        required: ['minutes'],
        additionalProperties: false,
      },
      execute: (input: { minutes: number }) => ({ dailyBudgetMinutes: setDailyBudget(input.minutes) }),
    });
    void register({
      name: 'find_marvel_watch_items',
      title: 'Find Marvel watch items',
      description: 'Searches the selected mode by title with optional tier, status, and format filters.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          tier: { type: 'string', enum: ['all', 'essential', 'recommended', 'optional'] },
          status: { type: 'string', enum: ['all', 'remaining', 'complete'] },
          format: { type: 'string', enum: ['all', 'movie', 'tv', 'special'] },
        },
        required: ['query'],
        additionalProperties: false,
      },
      execute: (input: {
        query: string;
        tier?: 'all' | Grade;
        status?: StatusFilter;
        format?: FormatFilter;
      }) => {
        const currentMode = modeRef.current;
        const numbers = new Set(modesData.modes[currentMode].itemNumbers);
        return items
          .filter((item) => {
            const complete = itemComplete(item, rowsRef.current);
            return (
              numbers.has(item.n) &&
              item.title.toLowerCase().includes(input.query.toLowerCase()) &&
              (!input.tier ||
                input.tier === 'all' ||
                gradeForMode(item, currentMode) === input.tier) &&
              (!input.status ||
                input.status === 'all' ||
                (input.status === 'complete' ? complete : !complete)) &&
              (!input.format || input.format === 'all' || item.type === input.format)
            );
          })
          .slice(0, 50);
      },
    });
    void register({
      name: 'open_marvel_watch_item',
      title: 'Open Marvel title details',
      description: 'Opens an exact catalog title in the signed-in tracker without changing progress.',
      inputSchema: {
        type: 'object',
        properties: { titleNumber: { type: 'integer', minimum: 1, maximum: items.length } },
        required: ['titleNumber'],
        additionalProperties: false,
      },
      execute: (input: { titleNumber: number }) => {
        const item = items.find((candidate) => candidate.n === input.titleNumber);
        if (!item) throw new Error('Unknown title number.');
        openItem(item);
        return { opened: item.n, title: item.title };
      },
    });
    void register({
      name: 'set_marvel_watch_progress',
      title: 'Set Marvel watch progress',
      description:
        'Writes a movie, season, or exact episode through the same catalog-bound observation contract as the UI.',
      inputSchema: {
        type: 'object',
        properties: {
          titleNumber: { type: 'integer', minimum: 1, maximum: items.length },
          episode: { type: 'integer', minimum: 1 },
          watched: { type: 'boolean' },
          progressSeconds: { type: 'integer', minimum: 0 },
        },
        required: ['titleNumber', 'watched'],
        additionalProperties: false,
      },
      execute: async (input: {
        titleNumber: number;
        episode?: number;
        watched: boolean;
        progressSeconds?: number;
      }) => {
        const item = items.find((candidate) => candidate.n === input.titleNumber);
        if (!item) throw new Error('Unknown title number.');
        if (
          input.episode &&
          (!item.episodeCount || input.episode > item.episodeCount)
        ) {
          throw new Error('Unknown episode.');
        }
        if (item.episodeCount && !input.episode && (input.progressSeconds ?? 0) > 0) {
          throw new Error('An episode is required for in-progress TV state.');
        }
        const observedAt = new Date().toISOString();
        const operations = input.episode
          ? episodeOperations(
              item,
              input.episode,
              input.watched,
              'webmcp',
              observedAt,
              rowsRef.current,
              input.progressSeconds ?? 0,
            )
          : titleOperations(
              item,
              input.watched,
              'webmcp',
              observedAt,
              input.progressSeconds ?? 0,
            );
        return submitOperations(operations);
      },
    });
    void register({
      name: 'import_marvel_watch_events',
      title: 'Preview or import exact watch events',
      description:
        'Previews by default and returns a token. Commit the same payload with that previewToken; stale, duplicate, and equal-time conflicts fail closed.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: ['jellyfin', 'trakt', 'import'] },
          commit: { type: 'boolean' },
          previewToken: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          operations: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'object',
              properties: {
                contentKey: {
                  type: 'string',
                  pattern: '^(title:[0-9]+|episode:[0-9]+:[0-9]+)$',
                },
                watched: { type: 'boolean' },
                progressSeconds: { type: 'integer', minimum: 0 },
                observedAt: { type: 'string' },
                externalEventId: { type: 'string' },
              },
              required: ['contentKey', 'watched', 'observedAt', 'externalEventId'],
              additionalProperties: false,
            },
          },
        },
        required: ['source', 'operations'],
        additionalProperties: false,
      },
      execute: async (input: {
        source: 'jellyfin' | 'trakt' | 'import';
        commit?: boolean;
        previewToken?: string;
        operations: Array<{
          contentKey: string;
          watched: boolean;
          progressSeconds?: number;
          observedAt: string;
          externalEventId: string;
        }>;
      }) => {
        if (input.commit === true && !input.previewToken) {
          throw new Error('Preview this exact import first, then commit with its previewToken.');
        }
        const operations = input.operations.map((operation) => ({
          ...operation,
          progressSeconds: operation.progressSeconds ?? 0,
          source: input.source,
        }));
        return submitOperations(operations, {
          preview: input.commit !== true,
          optimistic: false,
          previewToken: input.previewToken,
        });
      },
    });

    return () => controller.abort();
  }, [
    loading,
    fatalError,
    getLiveModes,
    getLiveStatus,
    items,
    openItem,
    setDailyBudget,
    setMode,
    submitOperations,
  ]);

  if (loading || fatalError) {
    return (
      <main className="protocol-shell state-shell">
        <header className="protocol-header">
          <Link className="protocol-brand" href="/">
            <span className="protocol-mark"><img src="/protocol-mark.svg" alt="" /></span>
            <span>DOOMSDAY <b>PROTOCOL</b></span>
          </Link>
          <a className="signout-link" href={signOutPath}>Sign out</a>
        </header>
        <section className="state-panel" aria-live="polite">
          <span className="state-code">{fatalError ? 'STATE UNVERIFIED' : 'RESTORING VAULT'}</span>
          <h1>{fatalError ? 'Nothing moves without proof.' : 'Reconstructing your mission.'}</h1>
          <p>
            {fatalError ??
              'Loading saved titles, episode observations, selected mode, and playback pace.'}
          </p>
          {fatalError && (
            <button type="button" className="primary-action" onClick={() => void loadProgress()}>
              RETRY VERIFICATION <span>→</span>
            </button>
          )}
        </section>
      </main>
    );
  }

  const visibleHistory = historyOpen ? history : history.slice(0, 8);
  const detailEpisodeCount = detailItem?.episodeCount ?? 0;
  const detailComplete = detailItem ? itemComplete(detailItem, rows) : false;
  const filtersActive =
    Boolean(query.trim()) || tier !== 'all' || statusFilter !== 'all' || formatFilter !== 'all';
  const filterSignature = [mode, query.trim().toLowerCase(), tier, statusFilter, formatFilter].join('|');
  const activeClosedFilteredEras =
    filteredEraState.signature === filterSignature
      ? filteredEraState.closed
      : new Set<string>();
  const visibleOpenEras = filtersActive
    ? new Set(Object.keys(grouped).filter((era) => !activeClosedFilteredEras.has(era)))
    : openEras;
  const sourceCounts = syncSummary.counts.filter((entry) => entry.outcome === 'applied');

  return (
    <main className="protocol-shell">
      <header className="protocol-header">
        <Link className="protocol-brand" href="/">
          <span className="protocol-mark"><img src="/protocol-mark.svg" alt="" /></span>
          <span>DOOMSDAY <b>PROTOCOL</b></span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#mission">Mission</a>
          <a href="#route">Route</a>
          <a href="#archive">Archive</a>
          <button type="button" onClick={() => setIntelOpen(true)}>Intel</button>
        </nav>
        <div className="header-actions">
          <span className="sync-indicator" title="Saved progress loaded">
            <i /> SYNCED
          </span>
          <button type="button" className="command-key" onClick={() => setPaletteOpen(true)}>
            SEARCH <kbd>⌘K</kbd>
          </button>
          <span className="user-chip">{displayName.split('@')[0]}</span>
          <a className="signout-link" href={signOutPath}>Sign out</a>
        </div>
      </header>

      <nav className="mode-deck" aria-label="Watch mode">
        {modeOptions.map(([key, value], index) => {
          const entry = modeMetrics.find((metric) => metric.key === key)!;
          return (
            <button
              type="button"
              key={key}
              className={cx('mode-card', mode === key && 'active')}
              onClick={() => void setMode(key).catch(() => undefined)}
              aria-pressed={mode === key}
            >
              <span className="mode-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="mode-name">
                <strong>{value.label}</strong>
                <small>{value.itemNumbers.length} titles · {entry.completedTitles} watched</small>
              </span>
              <span className="mode-meter" aria-hidden="true">
                <i style={{ width: Math.min(100, entry.percent) + '%' }} />
              </span>
              <b>{entry.percent.toFixed(0)}%</b>
            </button>
          );
        })}
      </nav>

      <section
        id="mission"
        className={cx('mission-stage', !next && 'mission-complete')}
        aria-labelledby="active-mission-title"
        style={{ '--active-poster-image': 'url("' + posterSrc(activeItem) + '")' } as React.CSSProperties}
      >
        <div className="mission-backdrop" aria-hidden="true" />
        <figure className="mission-poster">
          <img src={posterSrc(activeItem)} alt={activeItem.title + ' poster'} />
          <figcaption>
            <span>CATALOGUE</span>
            <b>#{String(activeItem.n).padStart(3, '0')}</b>
          </figcaption>
        </figure>

        <article className="mission-brief">
          <div className="mission-overline">
            {next ? 'NEXT UP' : 'MODE COMPLETE'} · {modesData.modes[mode].label}
          </div>
          <div className="mission-progress-line" aria-label={metrics.percent.toFixed(1) + ' percent complete'}>
            <i style={{ width: Math.min(100, metrics.percent) + '%' }} />
          </div>
          <div className="mission-statline">
            <strong>{metrics.percent.toFixed(1)}%</strong>
            <span>{metrics.completedTitles}/{metrics.totalTitles} titles</span>
            <span>{metrics.completedEpisodes}/{metrics.totalEpisodes} episodes</span>
          </div>
          <span className={cx('tier-badge', gradeForMode(activeItem, mode))}>
            {gradeForMode(activeItem, mode)}
          </span>
          <h1 id="active-mission-title">{next ? activeItem.title : 'Mode complete.'}</h1>
          {next && activeEpisode && (
            <p className="episode-banner">
              EPISODE {activeEpisode} OF {activeItem.episodeCount}
              {activeResumeSeconds > 0 && ' · RESUME AT ' + formatDuration(activeResumeSeconds / 60)}
            </p>
          )}
          {next && !spoilers ? (
            <button type="button" className="sealed-briefing" onClick={toggleSpoilers}>
              <span>BRIEFING SEALED</span>
              Reveal editorial context when you want it
            </button>
          ) : (
            <p className="mission-context">
              {next
                ? activeItem.context ?? 'Continue the complete first-time Marvel story order.'
                : 'Every title and episode in this mode is marked watched.'}
            </p>
          )}
          <dl className="mission-facts">
            <div>
              <dt>RUNTIME</dt>
              <dd>
                {next && activeEpisode
                  ? formatDuration(activeItem.runtime / (activeItem.episodeCount ?? 1) / speed)
                  : formatDuration(activeItem.runtime / speed)}
              </dd>
            </div>
            <div>
              <dt>FORMAT</dt>
              <dd>{activeItem.type === 'tv' ? (activeItem.episodeCount ?? 0) + ' episodes' : activeItem.type}</dd>
            </div>
            <div>
              <dt>WATCH NOTE</dt>
              <dd>{activeItem.instruction ?? 'Story order'}</dd>
            </div>
          </dl>
          <div className="mission-actions">
            <button
              type="button"
              className="primary-action"
              disabled={busy || !next}
              onClick={() =>
                next && activeEpisode ? toggleEpisode(next, activeEpisode) : next && toggleItem(next)
              }
            >
              {next
                ? activeEpisode
                  ? 'MARK EPISODE ' + activeEpisode + ' WATCHED'
                  : 'MARK WATCHED'
                : 'MODE COMPLETE'}
              <span>→</span>
            </button>
            <button type="button" className="secondary-action" onClick={() => openItem(activeItem)}>
              VIEW DETAILS
            </button>
          </div>
        </article>

        <aside className="mission-telemetry" aria-label="Deadline telemetry">
          <header>
            <span>READINESS TELEMETRY</span>
            <b>18 DEC 2026</b>
          </header>
          <div className="deadline-number">
            <strong>{daysRemaining}</strong>
            <span>DAYS<br />TO DOOMSDAY</span>
          </div>
          <div className="telemetry-grid">
            <div>
              <span>REMAINING AT {speed}×</span>
              <strong>{metrics.remainingHours.toFixed(1)}h</strong>
            </div>
            <div>
              <span>REQUIRED PACE</span>
              <strong>
                {metrics.dailyHoursNeeded < 1
                  ? Math.ceil(metrics.dailyHoursNeeded * 60) + 'm/day'
                  : metrics.dailyHoursNeeded.toFixed(1) + 'h/day'}
              </strong>
            </div>
            <div>
              <span>YOUR BUDGET</span>
              <strong>{dailyBudget}m/day</strong>
            </div>
            <div className={cx('forecast', bufferDays < 0 && 'at-risk')}>
              <span>PROJECTED FINISH</span>
              <strong>{Number.isFinite(finishDays) ? compactDate(projectedFinish) : '—'}</strong>
              <small>
                {metrics.remainingHours === 0
                  ? 'Complete'
                  : bufferDays >= 0
                    ? bufferDays + ' days spare'
                    : Math.abs(bufferDays) + ' days beyond target'}
              </small>
            </div>
          </div>
          <div className="telemetry-controls">
            <div className="segmented-control" aria-label="Playback speed">
              {[1, 2].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={speed === value ? 'active' : ''}
                  aria-pressed={speed === value}
                  onClick={() => void setSpeed(value as 1 | 2).catch(() => undefined)}
                >
                  {value}×
                </button>
              ))}
            </div>
            <label>
              <span>DAILY MINUTES</span>
              <input
                type="range"
                min="15"
                max="480"
                step="15"
                value={dailyBudget}
                onChange={(event) => setDailyBudget(Number(event.target.value))}
              />
            </label>
          </div>
        </aside>
      </section>

      <section className="session-rail" aria-labelledby="session-title">
        <header>
          <div>
            <span className="section-kicker">AUTO-BUILT FROM THE NEXT UNFINISHED UNITS</span>
            <h2 id="session-title">TONIGHT&apos;S SLATE</h2>
          </div>
          <p>
            {plan.units.length
              ? plan.units.length +
                ' unit' +
                (plan.units.length === 1 ? '' : 's') +
                ' · ' +
                formatDuration(plan.totalMinutes) +
                ' at ' +
                speed +
                '×'
              : plan.overflowUnit
                ? 'Next item needs ' +
                  formatDuration(plan.overflowUnit.remainingMinutes) +
                  ' · budget is ' +
                  dailyBudget +
                  ' min'
                : 'Nothing left in this mode.'}
          </p>
        </header>
        <div className="slate-track">
          {plan.units.map((unit, index) => {
            const item = items.find((candidate) => candidate.n === unit.titleNumber)!;
            return (
              <button
                type="button"
                className="slate-card"
                key={unit.key}
                onClick={() => openItem(item)}
              >
                <span className="slate-index">{String(index + 1).padStart(2, '0')}</span>
                <img src={posterSrc(item, 'w342')} alt="" loading="lazy" />
                <span className="slate-copy">
                  <strong>{unit.title}</strong>
                  <small>
                    {unit.episode ? 'Episode ' + unit.episode : item.type} ·{' '}
                    {formatDuration(unit.remainingMinutes)}
                  </small>
                </span>
              </button>
            );
          })}
          {plan.units.length === 0 && (
            <p className="empty-state">
              {plan.overflowUnit
                ? 'No item fits this budget. Add ' +
                  formatDuration(plan.overflowMinutes) +
                  ' or resume when you have more time.'
                : 'Mode complete. Pick another route to continue.'}
            </p>
          )}
        </div>
      </section>

      <section id="route" className="route-map" aria-labelledby="route-title">
        <header>
          <span className="section-kicker">CHRONOLOGICAL NAVIGATION</span>
          <h2 id="route-title">STORY ROUTE</h2>
          <p>Jump between eras without scrolling through every title.</p>
        </header>
        <div className="route-track">
          {allEraStats.map((entry, index) => (
            <button
              type="button"
              key={entry.era}
              className={cx(next?.era === entry.era && 'active')}
              onClick={() => jumpToEra(entry.era)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{entry.era}</strong>
              <small>{entry.completed}/{entry.items.length}</small>
              <i><b style={{ width: entry.percent + '%' }} /></i>
            </button>
          ))}
        </div>
      </section>

      <section className="screenings" aria-labelledby="screenings-title">
        <header>
          <div>
            <span className="section-kicker">SAVED WATCH HISTORY · {modesData.modes[mode].label}</span>
            <h2 id="screenings-title">LAST SCREENINGS</h2>
          </div>
          <p>{history.length} watched title{history.length === 1 ? '' : 's'}</p>
        </header>
        {history.length ? (
          <div className="screening-track">
            {visibleHistory.map(({ item, watchedAt }) => (
              <button
                type="button"
                className="screening-card"
                key={item.n}
                onClick={() => openItem(item)}
              >
                <img src={posterSrc(item, 'w342')} alt="" loading="lazy" />
                <span>
                  <small>{historyDate(watchedAt)}</small>
                  <strong>{item.title}</strong>
                  <b>✓ SAVED</b>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-state">Watched titles will appear here with their saved date.</p>
        )}
        {history.length > 8 && (
          <button
            type="button"
            className="text-action"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((value) => !value)}
          >
            {historyOpen ? 'SHOW RECENT ONLY' : 'SHOW ALL ' + history.length}
          </button>
        )}
      </section>

      <section id="archive" className="archive" aria-labelledby="archive-title">
        <header className="archive-heading">
          <div>
            <span className="section-kicker">{modesData.modes[mode].label}</span>
            <h2 id="archive-title">WATCH LIBRARY</h2>
            <p>All {missionItems.length} titles remain accessible. Open any era to browse.</p>
          </div>
          <div className="archive-count">
            <strong>{filtered.length}</strong>
            <span>VISIBLE<br />TITLES</span>
          </div>
        </header>

        <div className="archive-toolbar">
          <label className="archive-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this mode"
              aria-label="Search this mode"
            />
            <kbd>/</kbd>
          </label>
          <div className="filter-row" aria-label="Archive filters">
            <div role="group" aria-label="Watch status">
              {(['all', 'remaining', 'complete'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={statusFilter === value ? 'active' : ''}
                  aria-pressed={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Priority tier">
              {(['all', 'essential', 'recommended', 'optional'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={tier === value ? 'active' : ''}
                  aria-pressed={tier === value}
                  onClick={() => setTier(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Title format">
              {(['all', 'movie', 'tv', 'special'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={formatFilter === value ? 'active' : ''}
                  aria-pressed={formatFilter === value}
                  onClick={() => setFormatFilter(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            {filtersActive && (
              <button
                type="button"
                className="clear-filters"
                onClick={() => {
                  setQuery('');
                  setTier('all');
                  setStatusFilter('all');
                  setFormatFilter('all');
                }}
              >
                Clear
              </button>
            )}
          </div>
          <button
            type="button"
            className="era-toggle-all"
            onClick={() => {
              if (filtersActive) {
                setFilteredEraState({
                  signature: filterSignature,
                  closed:
                    visibleOpenEras.size === Object.keys(grouped).length
                      ? new Set(Object.keys(grouped))
                      : new Set(),
                });
                return;
              }
              setOpenEras(
                visibleOpenEras.size === Object.keys(grouped).length
                  ? new Set()
                  : new Set(Object.keys(grouped)),
              );
            }}
          >
            {filtersActive
              ? visibleOpenEras.size === Object.keys(grouped).length
                ? 'COLLAPSE FILTERED'
                : 'EXPAND FILTERED'
              : visibleOpenEras.size === Object.keys(grouped).length
                ? 'COLLAPSE ALL'
                : 'EXPAND ALL'}
          </button>
        </div>

        {Object.keys(grouped).length ? (
          <div className="era-stack">
            {Object.entries(grouped).map(([era, eraItems], index) => {
              const eraOpen = visibleOpenEras.has(era);
              const eraStats = allEraStats.find((entry) => entry.era === era)!;
              return (
                <section id={eraId(era)} className={cx('era-group', eraOpen && 'open')} key={era}>
                  <button
                    type="button"
                    className="era-heading"
                    aria-expanded={eraOpen}
                    aria-controls={eraId(era) + '-titles'}
                    onClick={() => {
                      const update = (current: Set<string>) => {
                        const nextSet = new Set(current);
                        if (nextSet.has(era)) nextSet.delete(era);
                        else nextSet.add(era);
                        return nextSet;
                      };
                      if (filtersActive) {
                        setFilteredEraState((current) => {
                          const nextSet = new Set(
                            current.signature === filterSignature ? current.closed : [],
                          );
                          if (eraOpen) nextSet.add(era);
                          else nextSet.delete(era);
                          return { signature: filterSignature, closed: nextSet };
                        });
                      } else {
                        setOpenEras(update);
                      }
                    }}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{era}</strong>
                    <small>
                      {eraStats.completed}/{eraStats.items.length} watched
                      {filtersActive ? ' · ' + eraItems.length + ' shown' : ''}
                    </small>
                    <b>{eraOpen ? '−' : '+'}</b>
                  </button>
                  {eraOpen && (
                    <div id={eraId(era) + '-titles'} className="poster-grid">
                      {eraItems.map((item) => {
                        const complete = itemComplete(item, rows);
                        const episodes = item.episodeCount ?? 0;
                        const completedEpisodes = Array.from(
                          { length: episodes },
                          (_, episode) => isWatched(rows, episodeKey(item.n, episode + 1)),
                        ).filter(Boolean).length;
                        return (
                          <article className={cx('poster-card', complete && 'complete')} key={item.n}>
                            <button
                              type="button"
                              className="poster-open"
                              onClick={() => openItem(item)}
                              aria-label={'View details for ' + item.title}
                            >
                              <img src={posterSrc(item, 'w342')} alt="" loading="lazy" />
                              <span className="poster-shade" />
                              <span className="poster-number">{String(item.n).padStart(3, '0')}</span>
                              <span className={cx('poster-grade', gradeForMode(item, mode))}>
                                {gradeForMode(item, mode)}
                              </span>
                              <span className="poster-copy">
                                <strong>{item.title}</strong>
                                <small>
                                  {episodes
                                    ? completedEpisodes + '/' + episodes + ' episodes'
                                    : formatDuration(item.runtime)}
                                </small>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="poster-check"
                              disabled={busy}
                              aria-pressed={complete}
                              aria-label={
                                complete
                                  ? 'Mark ' + item.title + ' unwatched'
                                  : 'Mark ' + item.title + ' complete'
                              }
                              onClick={() => toggleItem(item)}
                            >
                              {complete ? '✓' : ''}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="archive-empty">
            <span>NO MATCHING TITLES</span>
            <h3>Try a broader search or clear the filters.</h3>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setTier('all');
                setStatusFilter('all');
                setFormatFilter('all');
              }}
            >
              CLEAR FILTERS
            </button>
          </div>
        )}
      </section>

      <button type="button" className="floating-intel" onClick={() => setIntelOpen(true)}>
        <span aria-hidden="true">i</span>
        <b>INTEL</b>
      </button>
      <nav className="mobile-dock" aria-label="Mobile navigation">
        <a href="#mission">Mission</a>
        <button
          type="button"
          className="mobile-progress-action"
          disabled={busy || !next}
          aria-label={
            activeEpisode
              ? `Mark ${activeItem.title} episode ${activeEpisode} watched`
              : `Mark ${activeItem.title} watched`
          }
          onClick={() =>
            next && activeEpisode ? toggleEpisode(next, activeEpisode) : next && toggleItem(next)
          }
        >
          {next ? (activeEpisode ? `MARK E${activeEpisode}` : 'MARK WATCHED') : 'COMPLETE'}
        </button>
        <button type="button" onClick={() => setPaletteOpen(true)}>Search</button>
        <button type="button" onClick={() => setIntelOpen(true)}>Intel</button>
        <a href={signOutPath}>Sign out</a>
      </nav>

      {notice && (
        <div className={cx('status-toast', notice.tone)} role="status">
          <span>{notice.message}</span>
          {notice.undo && <button type="button" onClick={notice.undo}>UNDO</button>}
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      <dialog
        ref={paletteDialog}
        className="protocol-dialog command-dialog"
        aria-labelledby="command-dialog-title"
        onCancel={() => setPaletteOpen(false)}
        onClose={() => {
          setPaletteOpen(false);
          setCommandQuery('');
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setPaletteOpen(false);
        }}
      >
        {paletteOpen && (
          <div className="dialog-surface">
            <header>
              <span id="command-dialog-title" className="section-kicker">SEARCH TITLES</span>
              <button type="button" onClick={() => setPaletteOpen(false)} aria-label="Close search">×</button>
            </header>
            <label className="command-input">
              <span className="sr-only">Search titles</span>
              <span aria-hidden="true">⌕</span>
              <input
                autoFocus
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Find any title in this mode"
              />
              <kbd>ESC</kbd>
            </label>
            <div className="command-shortcuts">
              <span>MODE</span>
              {modeOptions.map(([key, value]) => (
                <button
                  type="button"
                  key={key}
                  className={mode === key ? 'active' : ''}
                  onClick={() => void setMode(key).catch(() => undefined)}
                >
                  {value.label}
                </button>
              ))}
            </div>
            <div className="command-results">
              {commandResults.map((item) => (
                <button
                  type="button"
                  key={item.n}
                  onClick={() => {
                    setPaletteOpen(false);
                    openItem(item);
                  }}
                >
                  <img src={posterSrc(item, 'w342')} alt="" />
                  <span>
                    <small>#{String(item.n).padStart(3, '0')} · {item.era}</small>
                    <strong>{item.title}</strong>
                  </span>
                  <b>{itemComplete(item, rows) ? '✓' : '→'}</b>
                </button>
              ))}
            </div>
          </div>
        )}
      </dialog>

      <dialog
        ref={detailDialog}
        className="protocol-dialog detail-dialog"
        aria-labelledby="detail-dialog-title"
        onCancel={() => setDetailNumber(null)}
        onClose={() => setDetailNumber(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDetailNumber(null);
        }}
      >
        {detailItem && (
          <article className="detail-surface">
            <button
              type="button"
              className="dialog-close"
              onClick={() => setDetailNumber(null)}
              aria-label="Close details"
            >
              ×
            </button>
            <div className="detail-art">
              <img src={posterSrc(detailItem)} alt={detailItem.title + ' poster'} />
              <span>#{String(detailItem.n).padStart(3, '0')}</span>
            </div>
            <div className="detail-copy">
              <span className="section-kicker">TITLE DETAILS · {detailItem.era}</span>
              <span className={cx('tier-badge', gradeForMode(detailItem, mode))}>
                {gradeForMode(detailItem, mode)}
              </span>
              <h2 id="detail-dialog-title">{detailItem.title}</h2>
              {!detailComplete && !spoilers ? (
                <button type="button" className="sealed-briefing" onClick={toggleSpoilers}>
                  <span>EDITORIAL CONTEXT SEALED</span>
                  Reveal spoilers across this device
                </button>
              ) : (
                <p>{detailItem.context}</p>
              )}
              <dl>
                <div><dt>RELEASED</dt><dd>{detailItem.releaseDate ?? '—'}</dd></div>
                <div><dt>RUNTIME</dt><dd>{formatDuration(detailItem.runtime)}</dd></div>
                <div><dt>STORY POSITION</dt><dd>#{detailItem.storyOrder}</dd></div>
                <div><dt>SOURCE ID</dt><dd>{detailItem.tmdbId ?? 'Parent-linked segment'}</dd></div>
              </dl>
              {detailEpisodeCount > 0 && (
                <div className="episode-selector" aria-label="Episode progress">
                  {Array.from({ length: detailEpisodeCount }, (_, index) => index + 1).map(
                    (episode) => {
                      const complete = isWatched(rows, episodeKey(detailItem.n, episode));
                      return (
                        <button
                          type="button"
                          key={episode}
                          className={complete ? 'complete' : ''}
                          aria-pressed={complete}
                          disabled={busy}
                          onClick={() => toggleEpisode(detailItem, episode)}
                        >
                          <span>{complete ? '✓' : episode}</span>
                          Episode {episode}
                        </button>
                      );
                    },
                  )}
                </div>
              )}
              <button
                type="button"
                className="primary-action"
                disabled={busy}
                onClick={() => toggleItem(detailItem)}
              >
                {detailComplete ? 'MARK UNWATCHED' : 'MARK COMPLETE'} <span>→</span>
              </button>
            </div>
          </article>
        )}
      </dialog>

      <dialog
        ref={intelDialog}
        className="protocol-dialog intel-dialog"
        aria-labelledby="intel-dialog-title"
        onCancel={() => setIntelOpen(false)}
        onClose={() => setIntelOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setIntelOpen(false);
        }}
      >
        {intelOpen && (
          <aside className="intel-surface">
            <button
              type="button"
              className="dialog-close"
              onClick={() => setIntelOpen(false)}
              aria-label="Close Intel"
            >
              ×
            </button>
            <span className="section-kicker">SOURCE & SYSTEM INTEL</span>
            <h2 id="intel-dialog-title">How progress is recorded</h2>
            <div className="integrity-status">
              <i />
              <span>
                <strong>SAVED STATE LOADED</strong>
                <small>
                  {syncSummary.latest
                    ? 'Last ' +
                      syncSummary.latest.source +
                      ' observation · ' +
                      historyDate(Date.parse(syncSummary.latest.receivedAt))
                    : 'Observation ledger ready'}
                  {syncSummary.legacyRows > 0 &&
                    ' · ' + syncSummary.legacyRows + ' retained legacy rows'}
                </small>
              </span>
            </div>
            <section>
              <h3>Observation provenance</h3>
              <div className="source-ledger">
                {sourceCounts.length ? (
                  sourceCounts.map((entry) => (
                    <div key={entry.source}>
                      <span>{entry.source}</span>
                      <strong>{entry.count}</strong>
                    </div>
                  ))
                ) : (
                  <p>No post-upgrade observations yet.</p>
                )}
              </div>
              <p>
                Manual taps, WebMCP, Jellyfin, Trakt, and trusted imports share one
                catalog-bound contract. The server returns authoritative receipts; stale,
                duplicate, and equal-time conflicts never masquerade as success.
              </p>
            </section>
            <section>
              <h3>Deterministic matching boundary</h3>
              <p>
                This tracker only accepts exact catalogue keys. External matching happens
                upstream using stable media IDs plus explicit season and episode mapping.
                Ambiguous title-only matches are rejected before preview.
              </p>
            </section>
            <section>
              <h3>WebMCP interface</h3>
              <p>
                Status, mode comparison, session planning, provenance, mode and daily-budget
                preferences, rich search, title navigation, exact progress writes, and
                preview-before-import are available without adding dashboard clutter.
              </p>
            </section>
            <section>
              <h3>Credits</h3>
              <p>
                Watch-order structure, 165/72/60 mode membership, and editorial
                context adapted from{' '}
                <a href="https://marvelwatchlist.com/" target="_blank" rel="noreferrer">
                  MarvelWatchList.com
                </a>
                . Poster images and identifiers via{' '}
                <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB</a>.
                This product uses the TMDB API but is not endorsed or certified by TMDB.
                Avengers, Marvel, titles, characters, and artwork belong to their respective
                rights holders. Unofficial, non-commercial fan tracker.
              </p>
            </section>
          </aside>
        )}
      </dialog>
    </main>
  );
}
