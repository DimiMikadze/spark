/* eslint-disable @next/next/no-img-element */

'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
    <details className='mt-1 rounded border border-white/10 bg-white/4 px-2 py-1 text-xs text-neutral-300'>
      <summary className='cursor-pointer font-medium'>{label}</summary>
      <pre className='mt-2 max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word'>{safeJson(value)}</pre>
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

// Brand mark used both as the small avatar on every assistant turn and the
// large hero above the first greeting. width/height attributes match the
// Tailwind size classes so the browser reserves space and avoids layout
// shift while the PNG loads.
function SparkAvatar({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const px = size === 'lg' ? 80 : 32;
  const dim = size === 'lg' ? 'h-20 w-20' : 'h-8 w-8';
  return (
    <img src='/spark-logo.png' alt='' width={px} height={px} className={`${dim} shrink-0 rounded-full object-cover`} />
  );
}

function ResetIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.8}
      strokeLinecap='round'
      strokeLinejoin='round'
      className='h-5 w-5'
    >
      <path d='M3 12a9 9 0 1 0 3-6.7' />
      <path d='M3 4v5h5' />
    </svg>
  );
}

export function ChatUI({
  initialMessages,
  variant = 'full',
}: {
  initialMessages: UIMessage[];
  variant?: ChatUIVariant;
}) {
  const { messages, sendMessage, status, setMessages } = useChat({ messages: initialMessages });
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as new tokens stream in so the latest turn stays visible.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const isStreaming = status === 'streaming' || status === 'submitted';
  const isEmbed = variant === 'embed';

  // We only show "Delivered" on the most recent user message, so cache its
  // index instead of scanning on every render row.
  const lastUserIndex = useMemo(() => messages.map((m) => m.role).lastIndexOf('user'), [messages]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput('');
  }

  // Reset clears the visible transcript back to the seeded greeting. The
  // session cookie persists, so a returning visitor still sees the
  // welcome-back copy after reset.
  function onReset() {
    setMessages(initialMessages);
    setInput('');
  }

  const containerClass = isEmbed
    ? 'flex h-dvh flex-col bg-neutral-950 text-neutral-100'
    : 'mx-auto flex h-dvh w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/[0.06] bg-neutral-950 text-neutral-100 shadow-2xl';

  return (
    <div className={containerClass}>
      <div className='flex items-center justify-end px-4 pt-4'>
        <button
          type='button'
          onClick={onReset}
          aria-label='Reset conversation'
          className='rounded-full p-2 text-neutral-400 transition hover:bg-white/5 hover:text-neutral-100'
        >
          <ResetIcon />
        </button>
      </div>

      <div ref={scrollRef} className='flex-1 overflow-y-auto px-4 pb-4'>
        <div className='flex flex-col items-center gap-3 pb-8 pt-2'>
          <SparkAvatar size='lg' />
          <h1 className='text-xl font-semibold tracking-tight'>Spark</h1>
        </div>

        <div className='space-y-4'>
          {messages.map((m, i) => {
            const isUser = m.role === 'user';
            const hasText = hasVisibleText(m);
            const hasDebug = !isEmbed && hasVisibleDebug(m);
            const showMetadata = !isEmbed && Boolean(m.metadata) && (hasText || hasDebug);

            if (!hasText && !hasDebug && !showMetadata) return null;

            const showDelivered = isUser && i === lastUserIndex && !isStreaming;

            return (
              <div key={m.id} className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && <SparkAvatar />}
                <div className={`flex max-w-[78%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  {hasText && (
                    <div className='whitespace-pre-wrap rounded-2xl bg-neutral-800 px-4 py-2 text-sm leading-relaxed text-neutral-100'>
                      {m.parts.map((part, j) => (part.type === 'text' ? <span key={j}>{part.text}</span> : null))}
                    </div>
                  )}
                  {hasDebug
                    ? m.parts
                        .filter(shouldRenderDebugPart)
                        .map((part, j) => <DebugBlock key={`d${j}`} label={part.type} value={part} />)
                    : null}
                  {showMetadata ? <DebugBlock label='message metadata' value={m.metadata} /> : null}
                  {showDelivered ? <div className='mt-1 text-[11px] text-neutral-500'>Delivered</div> : null}
                </div>
              </div>
            );
          })}

          {isStreaming ? (
            <div className='flex justify-start gap-2'>
              <SparkAvatar />
              <div className='rounded-2xl bg-neutral-800 px-4 py-2 text-sm text-neutral-400'>Spark is typing…</div>
            </div>
          ) : null}
        </div>
      </div>

      <form onSubmit={onSubmit} className='px-4 pb-4'>
        <div className='flex items-center gap-2 rounded-full border border-white/8 bg-neutral-900 px-4 py-2.5 focus-within:border-white/20'>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Type your message...'
            disabled={isStreaming}
            className='flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none disabled:opacity-60'
          />
        </div>
      </form>
    </div>
  );
}
