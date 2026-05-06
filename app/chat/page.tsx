import { ChatUI } from './chat-ui';
import { buildInitialMessages } from './messages';
import { hasReturningSession } from '@/app/session';

export default async function ChatPage() {
  const returning = await hasReturningSession();
  const initialMessages = buildInitialMessages({ returning });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-900 p-4">
      <ChatUI initialMessages={initialMessages} />
    </main>
  );
}
