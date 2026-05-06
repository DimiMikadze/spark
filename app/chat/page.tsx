import { ChatUI } from './chat-ui';
import { buildInitialMessages } from './messages';
import { hasReturningSession } from '@/app/session';

export default async function ChatPage() {
  const returning = await hasReturningSession();
  const initialMessages = buildInitialMessages({ returning });

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
      <h1 className="mb-4 text-xl font-semibold">Spark</h1>
      <ChatUI initialMessages={initialMessages} />
    </main>
  );
}
