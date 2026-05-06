import type { RetrievedChunk } from '../rag/types';
import type { SparkConversationState } from '../agents/agent-state';
import { buildBookerPrompt } from '../prompts';
import { createToolsForAgent } from '../tools';
import type { SparkAgentRuntime } from './types';

export function createBookerAgent(args: {
  currentDate: string;
  conversationId: string;
  state: SparkConversationState;
  retrieved: RetrievedChunk[];
}): SparkAgentRuntime {
  // Booker gets booking/email tools, but not lead creation. That keeps the
  // booking prompt smaller and prevents it from bypassing qualification.
  return {
    name: 'booker',
    system: buildBookerPrompt(args),
    tools: createToolsForAgent('booker', {
      conversationId: args.conversationId,
      state: args.state,
    }),
  };
}
