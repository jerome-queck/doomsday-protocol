import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
export type ChatGPTUser = { userId: string; displayName: string; email: string; fullName: string | null };
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const h = await headers();
  const userId = h.get('oai-authenticated-user-id');
  const email = h.get('oai-authenticated-user-email');
  if (!userId || !email) return null;
  const encoded = h.get('oai-authenticated-user-full-name'); let fullName: string | null = null;
  if (encoded && h.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') { try { fullName = decodeURIComponent(encoded); } catch { fullName = null; } }
  return { userId, email, fullName, displayName: fullName ?? email };
}
export function chatGPTSignInPath(returnTo: string) { const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'; return `/signin-with-chatgpt?return_to=${encodeURIComponent(safe)}`; }
export function chatGPTSignOutPath(returnTo = '/') { const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'; return `/signout-with-chatgpt?return_to=${encodeURIComponent(safe)}`; }
export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> { const user = await getChatGPTUser(); if (user) return user; redirect(chatGPTSignInPath(returnTo)); }
