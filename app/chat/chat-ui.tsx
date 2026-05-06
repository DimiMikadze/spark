'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';

type ChatUIVariant = 'full' | 'embed';

export function ChatUI({
  initialMessages,
  variant = 'full',
}: {
  initialMessages: UIMessage[];
  variant?: ChatUIVariant;
}) {
  const { messages, sendMessage, status } = useChat({ messages: initialMessages });
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as new tokens stream in so the latest turn stays visible.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const isStreaming = status === 'streaming' || status === 'submitted';

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    // AI SDK v6 sendMessage takes a { text } payload and posts to /api/chat.
    sendMessage({ text });
    setInput('');
  }

  const isEmbed = variant === 'embed';

  const emptyClass = isEmbed ? 'text-xs text-gray-500' : 'text-sm text-gray-500';
  const roleClass = isEmbed
    ? 'text-[10px] font-medium uppercase tracking-wide text-gray-500'
    : 'text-xs font-medium uppercase tracking-wide text-gray-500';
  const listClass = isEmbed ? 'flex-1 space-y-3 overflow-y-auto p-3' : 'flex-1 space-y-4 overflow-y-auto pb-4';
  const formClass = isEmbed ? 'flex gap-2 border-t p-3' : 'flex gap-2 border-t pt-3';
  const inputClass = isEmbed
    ? 'flex-1 rounded border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
    : 'flex-1 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const buttonClass = isEmbed
    ? 'rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50'
    : 'rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
  const placeholder = isEmbed ? 'Ask about your docs...' : 'Ask about your documents...';

  return (
    <div className={isEmbed ? 'flex h-dvh flex-col bg-white' : 'flex h-full flex-col'}>
      {isEmbed && <header className="border-b px-3 py-2 text-sm font-semibold">Spark</header>}
      <div ref={scrollRef} className={listClass}>
        {messages.length === 0 && (
          <p className={emptyClass}>
            Ask a question about the documents you ingested.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-1">
            <div className={roleClass}>{m.role}</div>
            <div className="whitespace-pre-wrap text-sm">
              {m.parts.map((part, i) =>
                part.type === 'text' ? <span key={i}>{part.text}</span> : null,
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className={formClass}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
          disabled={isStreaming}
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          className={buttonClass}
        >
          {isStreaming ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
