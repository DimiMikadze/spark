import { cookies } from 'next/headers';
import type { UIMessage } from 'ai';
import { getMessagesBySession } from '@/spark/queries';
import { ChatUI } from './chat-ui';

// Force dynamic rendering: this page reads cookies and the messages table,
// both of which differ per request. Without this Next.js may try to cache it.
export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('spark_session')?.value;

  // Fetch prior messages from the DB so they survive page reloads.
  // useChat manages the in-memory messages state; we hydrate it via
  // `initialMessages` so the user lands back on their previous transcript.
  const initialMessages: UIMessage[] = sessionId
    ? (await getMessagesBySession(sessionId)).map((r) => ({
        id: r.id,
        role: r.role,
        parts: [{ type: 'text', text: r.content }],
      }))
    : [];

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
      <h1 className="mb-4 text-xl font-semibold">Spark</h1>
      <ChatUI initialMessages={initialMessages} />
    </main>
  );
}
