'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';

export function ChatUI({ initialMessages }: { initialMessages: UIMessage[] }) {
  const { messages, sendMessage, status } = useChat({ messages: initialMessages });
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const isStreaming = status === 'streaming' || status === 'submitted';

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput('');
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Ask a question about the documents you ingested.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {m.role}
            </div>
            <div className="whitespace-pre-wrap text-sm">
              {m.parts.map((part, i) =>
                part.type === 'text' ? <span key={i}>{part.text}</span> : null,
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your documents..."
          className="flex-1 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isStreaming}
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isStreaming ? '…' : 'Send'}
        </button>
      </form>
    </>
  );
}
