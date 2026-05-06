import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { createUIMessageStreamResponse, type UIMessage } from 'ai';
import { chat } from '@/agents/orchestrator';
import { SESSION_COOKIE } from '@/app/session';

// We need Node, not Edge: `unpdf` and `mammoth` (used during ingestion) and
// the way streamText is wired want a Node runtime. Edge would also restrict
// `node:crypto` imports.
export const runtime = 'nodejs';

// CORS: the embeddable widget will load `/embed` inside an iframe on a third-
// party site. The iframe origin matches us, so the iframe itself is fine, but
// we still allow `*` here so direct-from-widget POSTs (if we ever need them)
// also work. Lock this down to known hosts before launching multi-tenant.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// Browsers send a preflight OPTIONS before any cross-origin POST with a
// JSON body. Without this handler the preflight fails and the real POST
// never goes out.
export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

// The widget loads /embed in a cross-site iframe, so the session cookie has
// to survive a third-party context. That means SameSite=None (Lax/Strict are
// dropped in cross-site iframes), Secure (required whenever SameSite=None;
// browsers treat http://localhost as secure so dev still works), and
// Partitioned for Chrome's CHIPS — without it Chrome drops the cookie under
// third-party cookie blocking. Without these, every POST from the embed mints
// a fresh sessionId and conversations never carry across turns.
function setCookieHeader(sessionId: string): string {
  return `${SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=None; Secure; Partitioned; Path=/; Max-Age=31536000`;
}

function currentDateInTbilisi(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Tbilisi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Runtime-only conversation id. We do not persist chat messages in the DB;
  // a page refresh starts from Spark's static greeting again.
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE)?.value;
  const sessionId = existing ?? randomUUID();
  const isNewSession = !existing;

  const currentDate = currentDateInTbilisi();
  const { stream } = await chat({
    messages,
    conversationId: sessionId,
    currentDate,
  });

  // We set the cookie via `Set-Cookie` header instead of `cookies().set(...)`
  // because the streaming Response flushes headers immediately — a later
  // `cookies().set()` would have no effect.
  const responseHeaders: Record<string, string> = { ...corsHeaders };
  if (isNewSession) responseHeaders['Set-Cookie'] = setCookieHeader(sessionId);

  return createUIMessageStreamResponse({
    stream,
    headers: responseHeaders,
  });
}
