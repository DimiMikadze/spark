import { cookies } from 'next/headers';
import { deleteState } from '@/agents/state';
import { buildInitialMessages } from '@/app/chat/messages';
import { SESSION_COOKIE } from '@/app/session';

export const runtime = 'nodejs';

// Clears the session cookie with the same attributes used to set it. Browsers
// only treat a Set-Cookie as overwriting an existing cookie when the name,
// Path, and (for partitioned cookies) the Partitioned flag all match — drop
// any of these and the old cookie sticks around.
function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=None; Secure; Partitioned; Path=/; Max-Age=0`;
}

export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  // Drop the in-memory ConversationState so the next turn restarts at Greeter.
  // Without this the user keeps the same active agent (e.g. Booker) even
  // after a "start over" click.
  if (sessionId) deleteState(sessionId);

  // Cookie is now cleared, so the next chat turn mints a fresh sessionId and
  // the user is treated as first-time — return the first-time greeting to
  // match.
  const messages = buildInitialMessages({ returning: false });

  return Response.json(
    { messages },
    { headers: { 'Set-Cookie': clearCookieHeader() } },
  );
}
