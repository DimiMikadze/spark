import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { openai, type OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';
import { retrieve } from './retrieve';
import { createAgentRuntime, selectAgent } from '../agents';
import { getConversationState } from '../agents/agent-state';

function extractText(message: UIMessage): string {
  return message.parts
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
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const query = lastUser ? extractText(lastUser) : '';

  // Retrieve enumeral-specific context for every agent turn. This is not the
  // whole assistant prompt; it is only the knowledge source agents may cite.
  const retrieved = query ? await retrieve(query, 5) : [];

  // State decides which small agent prompt runs. We keep the route handler
  // thin so product workflow stays out of Next.js files.
  const state = getConversationState(conversationId, messages);
  const agentName = selectAgent(state);
  const agent = createAgentRuntime({
    agentName,
    conversationId,
    currentDate,
    state,
    retrieved,
  });

  // One model call runs one selected agent with only that agent's tools.
  // `stopWhen` lets the agent use a tool and then produce visible text.
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
  });

  return { result, retrieved, agentName, state };
}
