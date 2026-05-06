import { cookies } from 'next/headers';

// Cookie name is shared between the API route that sets it (after the first
// POST to /api/chat) and the server-rendered chat pages that read it to
// decide which greeting to show. Keep one source of truth so they don't drift.
export const SESSION_COOKIE = 'spark_session';

// True when the visitor has talked to Spark at least once before. The cookie
// is only set on a successful POST round-trip, so its presence is a reliable
// proxy for "we've seen this browser before" — not just "they loaded the page".
export async function hasReturningSession(): Promise<boolean> {
  const store = await cookies();
  return store.has(SESSION_COOKIE);
}
