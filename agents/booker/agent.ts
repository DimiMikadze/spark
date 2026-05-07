// Booker agent factory.
//
// Mirrors the Qualifier shape: load prompt, attach Booker's tool set. Booker
// has no `handoffToBooker` since it is the terminal agent in the flow.

import type { UIMessage } from 'ai';
import type { ConversationState, SparkAgentRuntime } from '@/types';
import { loadPrompt } from '@/agents/shared/prompt';
import { createToolsForAgent } from '@/tools';

export function createBookerAgent(args: {
  state: ConversationState;
  conversationId: string;
  currentDate: string;
  messages: UIMessage[];
}): SparkAgentRuntime {
  return {
    name: 'booker',
    system: loadPrompt('booker', {
      currentDate: args.currentDate,
      conversationId: args.conversationId,
    }),
    tools: createToolsForAgent('booker', args.state, args.messages),
  };
}
