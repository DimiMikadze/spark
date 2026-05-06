import { buildInitialMessages } from '@/app/chat/messages';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ messages: buildInitialMessages() });
}
