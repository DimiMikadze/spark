import { cookies } from 'next/headers';
import { sessionHasMessages } from '@/rag/queries';

// Cookie name is shared between the API route that sets it (after the first
// POST to /api/chat) and the server-rendered chat pages that read it to
// decide which greeting to show. Keep one source of truth so they don't drift.
export const SESSION_COOKIE = 'spark_session';

// We also verify the session has persisted messages — not just that the cookie
// exists — so a dev `pnpm db:wipe` (or any DB reset) doesn't leave the browser
// stuck on the "returning visitor" greeting with no actual history behind it.
export async function hasReturningSession(): Promise<boolean> {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (!sessionId) return false;
  return sessionHasMessages(sessionId);
}
