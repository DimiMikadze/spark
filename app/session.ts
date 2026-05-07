import { cookies } from 'next/headers';

// Cookie name is shared between the API route that sets it (after the first
// POST to /api/chat) and the server-rendered chat pages that read it to
// decide which greeting to show. Keep one source of truth so they don't drift.
export const SESSION_COOKIE = 'spark_session';

export async function hasReturningSession(): Promise<boolean> {
  const store = await cookies();
  return Boolean(store.get(SESSION_COOKIE)?.value);
}
