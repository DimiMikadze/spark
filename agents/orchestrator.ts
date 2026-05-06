// Per-turn orchestration.
//
// Picks the active agent, runs it, and lets handoff happen via tool calls.
// When a handoff fires during a turn, the target agent runs immediately in
// the same HTTP response so the user sees one continuous reply.

import { streamText, convertToModelMessages, createUIMessageStream, stepCountIs, type UIMessage } from 'ai';
import { openai, type OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';
import type { ConversationState, SparkAgentName, SparkAgentRuntime } from '@/types';
import { createBookerAgent } from '@/agents/booker/agent';
import { createQualifierAgent } from '@/agents/qualifier/agent';
import { runGreeter } from '@/agents/greeter/agent';
import { applyPendingHandoff, getOrCreateState, snapshotState } from '@/agents/state';

// Registry of model-driven agents. Adding a new agent is one line here plus
// the matching folder in `agents/`. Greeter is excluded because it never
// reaches the model.
type AgentContext = {
  state: ConversationState;
  conversationId: string;
  currentDate: string;
};
const AGENTS: Record<Exclude<SparkAgentName, 'greeter'>, (ctx: AgentContext) => SparkAgentRuntime> = {
  qualifier: createQualifierAgent,
  booker: createBookerAgent,
};

const PROVIDER_OPTIONS = {
  openai: {
    reasoningEffort: 'none',
    textVerbosity: 'low',
  } satisfies OpenAILanguageModelResponsesOptions,
};

function lastUserText(messages: UIMessage[]): string {
  const m = [...messages].reverse().find((x) => x.role === 'user');
  if (!m) return '';
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

export async function chat({
  messages,
  conversationId,
  currentDate,
}: {
  messages: UIMessage[];
  conversationId: string;
  currentDate: string;
}) {
  const state = getOrCreateState(conversationId);

  console.info('[turn:start]', {
    conversationId,
    activeAgent: state.activeAgent,
    user: lastUserText(messages),
  });

  // Greeter is a no-op transition: the static greeting is already on the
  // client, so we just flip the active agent and let the next agent handle
  // this user message in the same turn.
  if (state.activeAgent === 'greeter') runGreeter(state);

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      let modelMessages = await convertToModelMessages(messages);

      // Run the active agent. If it records a handoff, apply it and run the
      // next agent in the same HTTP response. Loop so future multi-step
      // handoffs (e.g. agent A → B → C) just work.
      while (true) {
        const activeAgent = state.activeAgent as keyof typeof AGENTS;
        const agent = AGENTS[activeAgent]({ state, conversationId, currentDate });

        const r = streamText({
          model: openai('gpt-5.4'),
          system: agent.system,
          messages: modelMessages,
          tools: agent.tools,
          stopWhen: stepCountIs(8),
          maxOutputTokens: 600,
          providerOptions: PROVIDER_OPTIONS,
          onFinish: ({ text, finishReason, usage }) => {
            const pending = state.pendingHandoff;
            console.info('[turn:end]', {
              agent: agent.name,
              finishReason,
              tokens: `in ${usage.inputTokens} (cached ${usage.cachedInputTokens ?? 0}) / out ${usage.outputTokens}`,
              handoff: pending ? `${agent.name} → ${pending.target} (${pending.reason})` : null,
              text: text.length > 240 ? `${text.slice(0, 240)}…` : text,
            });
          },
          onError: ({ error }) => console.error('[turn:error]', error),
        });

        writer.merge(
          r.toUIMessageStream({
            messageMetadata: ({ part }) =>
              part.type === 'finish'
                ? {
                    agent: agent.name,
                    conversationId,
                    currentDate,
                    state: snapshotState(conversationId),
                  }
                : undefined,
          }),
        );

        // Drain so onFinish runs and any pending handoff is recorded before
        // we decide whether to chain the next agent.
        await r.consumeStream();

        if (!state.pendingHandoff) return;

        // Carry the previous agent's tool calls into the next agent's
        // message history so it sees what just happened.
        const response = await r.response;
        modelMessages = [...modelMessages, ...response.messages];
        applyPendingHandoff(state);
      }
    },
    onError: (error) => {
      console.error('[stream:error]', error);
      return 'An error occurred.';
    },
  });

  return { stream, state };
}
