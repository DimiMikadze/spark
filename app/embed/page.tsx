import { ChatUI } from '@/app/chat/chat-ui';
import { buildInitialMessages } from '@/app/chat/messages';
import { hasReturningSession } from '@/app/session';

export default async function EmbedPage() {
  const returning = await hasReturningSession();
  const initialMessages = buildInitialMessages({ returning });

  return <ChatUI initialMessages={initialMessages} variant="embed" />;
}
