import { NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import watchlist from '@/data/watchlist.json';
import { validateOperationBatch, validatePreferences } from '@/lib/progress-contract';
import {
  previewProgress,
  PreviewMismatchError,
  readPreferences,
  readProgress,
  readSyncSummary,
  writePreferences,
  writeProgress,
  writeWatchMode,
} from '@/lib/progress-store';
import type { MarvelItem } from '@/lib/marvel-types';

const catalog = watchlist as unknown as MarvelItem[];

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const [progress, preferences, syncSummary] = await Promise.all([
    readProgress(user.userId),
    readPreferences(user.userId),
    readSyncSummary(user.userId),
  ]);
  return NextResponse.json({ progress, preferences, syncSummary });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  const hasOperations = candidate.operations !== undefined;
  const hasPreferences = candidate.preferences !== undefined;
  if (hasOperations === hasPreferences) {
    return NextResponse.json(
      { error: 'Provide exactly one of operations or preferences' },
      { status: 400 },
    );
  }

  if (hasPreferences) {
    const validation = validatePreferences(candidate.preferences);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const results = await Promise.all([
      validation.preferences.playbackSpeed !== undefined
        ? writePreferences(user.userId, validation.preferences.playbackSpeed)
        : null,
      validation.preferences.watchMode !== undefined
        ? writeWatchMode(user.userId, validation.preferences.watchMode)
        : null,
    ]);
    return NextResponse.json({
      preferences: await readPreferences(user.userId),
      updates: results.filter(Boolean),
    });
  }

  if (candidate.preview !== undefined && typeof candidate.preview !== 'boolean') {
    return NextResponse.json({ error: 'preview must be boolean' }, { status: 400 });
  }
  const validation = validateOperationBatch(candidate.operations, catalog);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error, issues: validation.issues },
      { status: 400 },
    );
  }
  const preview = candidate.preview === true;
  const externalCommit =
    !preview &&
    validation.operations.some((operation) =>
      ['jellyfin', 'trakt', 'import'].includes(operation.source),
    );
  const previewToken = candidate.previewToken;
  if (
    externalCommit &&
    (typeof previewToken !== 'string' || !/^[a-f0-9]{64}$/.test(previewToken))
  ) {
    return NextResponse.json(
      { error: 'A current previewToken is required before committing an external import.' },
      { status: 400 },
    );
  }
  try {
    const result = preview
      ? await previewProgress(user.userId, validation.operations)
      : await writeProgress(
          user.userId,
          validation.operations,
          typeof previewToken === 'string' ? previewToken : undefined,
        );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PreviewMismatchError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
