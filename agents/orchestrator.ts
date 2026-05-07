// Per-turn orchestration.
//
// Picks the active agent, runs it, and lets handoff happen via tool calls.
// When a handoff fires during a turn, the target agent runs immediately in
// the same HTTP response so the user sees one continuous reply.

import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  stepCountIs,
  type ModelMessage,
  type UIMessage,
} from 'ai';
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
  messages: UIMessage[];
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

// Sliding-window cap on history sent to the model.
//
// Every HTTP turn re-sends the full client-side message history, so input
// tokens grow with every back-and-forth. Without a cap, total cost over a
// conversation grows roughly quadratically and the input eventually
// exceeds the model's context window — at which point streamText throws
// and the user sees a generic error on every subsequent turn forever
// (because the next turn re-sends the same too-long history).
//
// Twenty user turns sits well above the qualifier+booker flow's natural
// length (greet → a handful of qualifying questions → handoff → pick a
// slot) but well below the context window, leaving headroom for fat
// in-turn tool calls.
const MAX_USER_TURNS = 20;

// Byte budget per tool result in *prior* turns.
//
// searchKnowledge in particular returns several KB of retrieved chunks.
// They're useful on the turn that asked for them but rarely needed two
// turns later, yet currently they re-bill on every input forever. Anything
// above this gets replaced with a short stub so the model still sees that
// the call happened, just without the body.
const TOOL_RESULT_MAX_BYTES = 2000;

// Drop everything older than the most recent MAX_USER_TURNS user messages.
//
// We always cut at a user-message boundary because tool-call / tool-result
// pairs sit between two user messages. Slicing anywhere else would orphan
// a tool-call without its result (or a result without its call) and the
// model errors out on the dangling pair.
//
// System prompts are passed separately via `system:` on streamText, so
// they don't live in this array and aren't affected by the trim.
function trimHistory(messages: ModelMessage[]): ModelMessage[] {
  const userIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') userIndices.push(i);
  }
  if (userIndices.length <= MAX_USER_TURNS) return messages;
  const cutFrom = userIndices[userIndices.length - MAX_USER_TURNS];
  const trimmed = messages.slice(cutFrom);
  // Logged only when the trim actually fires (i.e. past MAX_USER_TURNS) so
  // a normal short conversation stays silent. Useful for verifying input
  // tokens plateau in `[turn:end]` once we cross the threshold.
  console.info('[turn:trim]', {
    droppedMessages: messages.length - trimmed.length,
    totalUserTurns: userIndices.length,
    keptUserTurns: MAX_USER_TURNS,
  });
  return trimmed;
}

// Replace fat tool-result payloads in prior turns with a short stub.
//
// "Prior" means: before the most recent user message. Everything from that
// user message onward is the in-flight reasoning chain for the current
// request — those tool results were either just produced for this turn or
// are about to be consumed by the next agent in a handoff, and the model
// still needs the full body to reason over them. Once a new user message
// arrives on the next HTTP turn, those payloads cross the boundary and
// become candidates for compaction.
//
// Only role: 'tool' messages are touched. AssistantContent technically
// also allows ToolResultPart (provider-executed tools), but Spark's tools
// all run server-side via streamText so that path doesn't appear in
// practice — keeping the helper narrow avoids rewriting code paths we
// don't exercise.
function compactToolResults(messages: ModelMessage[]): ModelMessage[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }
  // Nothing prior to compact: either there's no user message at all, or
  // the only one is at index 0 with no history before it.
  if (lastUserIdx <= 0) return messages;

  // Tally what got rewritten so we can log once at the end. Helps verify
  // that a fat searchKnowledge result actually drops out of input on the
  // turn after it's used, rather than re-billing forever.
  let elidedCount = 0;
  let bytesElided = 0;
  const tools: string[] = [];

  const result = messages.map((msg, i) => {
    if (i >= lastUserIdx) return msg;
    if (msg.role !== 'tool') return msg;

    // ToolContent is an array of ToolResultPart | ToolApprovalResponse.
    // Approval responses are tiny and structural; only result parts can
    // grow large, so they're the only thing we rewrite.
    const compacted = msg.content.map((part) => {
      if (part.type !== 'tool-result') return part;
      const size = JSON.stringify(part.output).length;
      if (size <= TOOL_RESULT_MAX_BYTES) return part;
      elidedCount += 1;
      bytesElided += size;
      tools.push(part.toolName);
      return {
        ...part,
        output: {
          type: 'json' as const,
          value: {
            ok: true,
            elided: true,
            summary: `${part.toolName} result elided from history (${size} bytes)`,
          },
        },
      };
    });
    return { ...msg, content: compacted };
  });

  // Silent when nothing was over budget, so turns that don't carry fat
  // tool results stay quiet.
  if (elidedCount > 0) {
    console.info('[turn:compact]', {
      results: elidedCount,
      bytesElided,
      tools,
    });
  }
  return result;
}

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
        const agent = AGENTS[activeAgent]({ state, conversationId, currentDate, messages });

        // Bound the history we send to the model on every iteration. Doing
        // this inside the loop (rather than once before it) also covers the
        // multi-agent handoff case: once agent A's response is concatenated
        // into modelMessages and we loop back for agent B, those additions
        // flow through the same trim/compact pipeline. Trim first, then
        // compact, so compactToolResults only walks the messages we're
        // actually going to send.
        const boundedMessages = compactToolResults(trimHistory(modelMessages));

        const r = streamText({
          model: openai('gpt-5.4'),
          system: agent.system,
          messages: boundedMessages,
          tools: agent.tools,
          stopWhen: stepCountIs(8),
          maxOutputTokens: 600,
          providerOptions: PROVIDER_OPTIONS,
          onFinish: ({ text, finishReason, usage }) => {
            const pending = state.pendingHandoff;
            console.info('[turn:end]', {
              agent: agent.name,
              finishReason,
              tokens: `in ${usage.inputTokens} (cached ${usage.inputTokenDetails.cacheReadTokens ?? 0}) / out ${usage.outputTokens}`,
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
