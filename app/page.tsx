import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Spark</h1>
      <p className="max-w-md text-sm text-gray-600 dark:text-gray-400">
        A local-first RAG chatbot. Drop documents in <code>docs/</code>, run{' '}
        <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">pnpm ingest</code>, then chat.
      </p>
      <Link
        href="/chat"
        className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Open chat
      </Link>
    </main>
  );
}
