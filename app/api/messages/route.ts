import { cookies } from 'next/headers';
import { getMessagesBySession } from '@/rag/queries';

export const runtime = 'nodejs';

const SESSION_COOKIE = 'spark_session';

export async function GET() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionId) {
    return Response.json({ messages: [] });
  }

  const rows = await getMessagesBySession(sessionId);
  const messages = rows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: [{ type: 'text' as const, text: row.content }],
  }));

  return Response.json({ messages });
}
