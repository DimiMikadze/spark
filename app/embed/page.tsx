import { ChatUI } from '@/app/chat/chat-ui';
import { buildInitialMessages } from '@/app/chat/messages';

export default async function EmbedPage() {
  const initialMessages = buildInitialMessages();

  return <ChatUI initialMessages={initialMessages} variant="embed" />;
}
