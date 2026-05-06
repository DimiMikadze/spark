// Per-turn orchestration.
//
// Picks the active agent, runs it, and lets handoff happen via tool calls.
// The route handler stays thin: it converts the streamed result into an
// HTTP response and tags metadata. Product workflow lives here.

import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { openai, type OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';
import type { SparkAgentName, SparkAgentRuntime } from '@/types';
import { createBookerAgent } from '@/agents/booker/agent';
import { createQualifierAgent } from '@/agents/qualifier/agent';
import { runGreeter } from '@/agents/greeter/agent';
import { applyPendingHandoff, getOrCreateState } from '@/agents/state';

// Pull just the latest user text out of the message history so the turn:start
// log shows what triggered this turn without dumping the whole transcript.
function lastUserText(messages: UIMessage[]): string {
  const m = [...messages].reverse().find((x) => x.role === 'user');
  if (!m) return '';
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

function buildAgent(args: {
  agentName: SparkAgentName;
  conversationId: string;
  currentDate: string;
  state: ReturnType<typeof getOrCreateState>;
}): SparkAgentRuntime {
  if (args.agentName === 'booker') {
    return createBookerAgent({
      state: args.state,
      conversationId: args.conversationId,
      currentDate: args.currentDate,
    });
  }
  // Greeter never reaches this path: the orchestrator transitions out of it
  // before calling the model. Default to Qualifier for everything else.
  return createQualifierAgent({
    state: args.state,
    conversationId: args.conversationId,
    currentDate: args.currentDate,
  });
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
  // client, so we just flip the active agent and let Qualifier handle this
  // user message in the same turn. Zero LLM cost for this step.
  if (state.activeAgent === 'greeter') {
    runGreeter(state);
  }

  const agent = buildAgent({
    agentName: state.activeAgent,
    conversationId,
    currentDate,
    state,
  });

  // The agent's prompt is stable across turns — only the runtime footer
  // (date, conversation id) changes — so OpenAI's automatic prompt cache
  // hits on the prefix once we're past the first turn.
  //
  // `stopWhen: stepCountIs(8)` lets the model call a few tools and still
  // emit a final user-facing message in one turn.
  const result = streamText({
    model: openai('gpt-5.4-mini'),
    system: agent.system,
    messages: await convertToModelMessages(messages),
    tools: agent.tools,
    stopWhen: stepCountIs(8),
    maxOutputTokens: 600,
    providerOptions: {
      openai: {
        reasoningEffort: 'none',
        textVerbosity: 'low',
      } satisfies OpenAILanguageModelResponsesOptions,
    },
    // Tool calls record handoff intent into `state` synchronously. Apply it
    // here so the next user turn routes to the new active agent.
    onFinish: ({ finishReason, usage }) => {
      const pending = state.pendingHandoff;
      applyPendingHandoff(state);
      console.info('[turn:end]', {
        agent: agent.name,
        finishReason,
        tokens: `in ${usage.inputTokens} (cached ${usage.cachedInputTokens ?? 0}) / out ${usage.outputTokens}`,
        handoff: pending ? `${agent.name} → ${pending.target} (${pending.reason})` : null,
      });
    },
    onError: ({ error }) => {
      console.error('[turn:error]', error);
    },
  });

  return { result, agentName: agent.name, state };
}
