import { buildInitialMessages } from '@/app/chat/messages';
import { hasReturningSession } from '@/app/session';

export const runtime = 'nodejs';

export async function GET() {
  const returning = await hasReturningSession();
  return Response.json({ messages: buildInitialMessages({ returning }) });
}
