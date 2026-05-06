// Qualifier agent factory.
//
// Thin wrapper: load the prompt from disk, attach the qualifier-only tool
// set. The orchestrator does the actual `streamText` call.

import type { ConversationState, SparkAgentRuntime } from '@/types';
import { loadPrompt } from '@/agents/shared/prompt';
import { createToolsForAgent } from '@/tools';

export function createQualifierAgent(args: {
  state: ConversationState;
  conversationId: string;
  currentDate: string;
}): SparkAgentRuntime {
  return {
    name: 'qualifier',
    system: loadPrompt('qualifier', {
      currentDate: args.currentDate,
      conversationId: args.conversationId,
    }),
    tools: createToolsForAgent('qualifier', args.state),
  };
}
