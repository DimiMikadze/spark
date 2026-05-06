import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import type { UIMessage } from 'ai';
import { chat } from '@/spark/chat';
import { createChatSession, saveMessage } from '@/spark/queries';

// We need Node, not Edge: `unpdf` and `mammoth` (used during ingestion) and
// the way streamText is wired want a Node runtime. Edge would also restrict
// `node:crypto` imports.
export const runtime = 'nodejs';

const SESSION_COOKIE = 'spark_session';

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

function extractText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

function setCookieHeader(sessionId: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`;
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Sessions: a UUID kept in an httpOnly cookie. No auth, no DB lookup —
  // first POST creates a row, every subsequent POST reuses the cookie value.
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE)?.value;
  const sessionId = existing ?? randomUUID();
  const isNewSession = !existing;

  if (isNewSession) {
    await createChatSession(sessionId);
  }

  // Persist the new user message immediately, before the LLM call. If the
  // LLM call fails, the user can still see their question in their history.
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (lastUser) {
    const text = extractText(lastUser);
    if (text) await saveMessage(sessionId, 'user', text);
  }

  const { result } = await chat(messages);

  // We set the cookie via `Set-Cookie` header instead of `cookies().set(...)`
  // because `toUIMessageStreamResponse` returns a streaming Response — by the
  // time it's constructed, Next.js has already flushed headers, so a later
  // `cookies().set()` would have no effect.
  const responseHeaders: Record<string, string> = { ...corsHeaders };
  if (isNewSession) responseHeaders['Set-Cookie'] = setCookieHeader(sessionId);

  // `onFinish` runs once the stream completes — that's where the assistant's
  // full text is available. We persist it then so a page reload shows the
  // completed turn (the streaming-only state lives in React's useChat).
  return result.toUIMessageStreamResponse({
    headers: responseHeaders,
    onFinish: async ({ responseMessage }) => {
      const text = extractText(responseMessage);
      if (text) await saveMessage(sessionId, 'assistant', text);
    },
  });
}
