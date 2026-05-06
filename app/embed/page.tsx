import { cookies } from 'next/headers';
import type { UIMessage } from 'ai';
import { getMessagesBySession } from '@/rag/queries';
import { ChatUI } from '@/app/chat/chat-ui';

export const dynamic = 'force-dynamic';

export default async function EmbedPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('spark_session')?.value;
  const initialMessages: UIMessage[] = sessionId
    ? (await getMessagesBySession(sessionId)).map((r) => ({
        id: r.id,
        role: r.role,
        parts: [{ type: 'text', text: r.content }],
      }))
    : [];

  return <ChatUI initialMessages={initialMessages} variant="embed" />;
}
