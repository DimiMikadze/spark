'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';

type ChatUIVariant = 'full' | 'embed';

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function DebugBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
      <summary className="cursor-pointer font-medium">{label}</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words">
        {safeJson(value)}
      </pre>
    </details>
  );
}

function shouldRenderDebugPart(part: UIMessage['parts'][number]): boolean {
  if (part.type === 'step-start') return false;
  if (part.type === 'reasoning') return false;
  return part.type.startsWith('tool-') || part.type === 'dynamic-tool';
}

function hasVisibleText(message: UIMessage): boolean {
  return message.parts.some((part) => part.type === 'text' && part.text.trim());
}

function hasVisibleDebug(message: UIMessage): boolean {
  return message.parts.some(shouldRenderDebugPart);
}

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
  const placeholder = isEmbed ? 'Reply to Spark...' : 'Reply to Spark...';

  return (
    <div className={isEmbed ? 'flex h-dvh flex-col bg-white' : 'flex h-full flex-col'}>
      {isEmbed && <header className="border-b px-3 py-2 text-sm font-semibold">Spark</header>}
      <div ref={scrollRef} className={listClass}>
        {messages.length === 0 && (
          <p className={emptyClass}>
            Spark can answer questions about enumeral and help book an intro call.
          </p>
        )}
        {messages.map((m) => {
          const hasText = hasVisibleText(m);
          const hasDebug = !isEmbed && hasVisibleDebug(m);
          const showMetadata = !isEmbed && m.metadata && (hasText || hasDebug);

          if (!hasText && !hasDebug && !showMetadata) return null;

          return (
            <div key={m.id} className="space-y-1">
              <div className={roleClass}>{m.role}</div>
              <div className="whitespace-pre-wrap text-sm">
                {m.parts.map((part, i) => {
                  if (part.type === 'text') return <span key={i}>{part.text}</span>;
                  if (isEmbed) return null;
                  if (!shouldRenderDebugPart(part)) return null;
                  return <DebugBlock key={i} label={part.type} value={part} />;
                })}
              </div>
              {showMetadata ? <DebugBlock label="message metadata" value={m.metadata} /> : null}
            </div>
          );
        })}
        {isStreaming && messages.every((m) => m.role !== 'assistant' || hasVisibleText(m)) ? (
          <p className="text-sm text-gray-500">Spark is typing...</p>
        ) : null}
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
          {isStreaming ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
