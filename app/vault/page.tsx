import { requireChatGPTUser, chatGPTSignOutPath } from '../chatgpt-auth';
import TrackerClient, { type MarvelItem } from './tracker-client';
import watchlist from '@/data/watchlist.json';
export const dynamic = 'force-dynamic';
export default async function VaultPage() {
  const user = await requireChatGPTUser('/vault');
  const target = new Date('2026-12-18T00:00:00+08:00').getTime();
  // Server-rendered countdown intentionally reflects request time.
  // eslint-disable-next-line react-hooks/purity
  const daysRemaining = Math.max(0, Math.ceil((target - Date.now()) / 86400000));
  return <TrackerClient items={watchlist as unknown as MarvelItem[]} displayName={user.displayName} signOutPath={chatGPTSignOutPath('/')} daysRemaining={daysRemaining} />;
}
