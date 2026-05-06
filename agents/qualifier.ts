import type { RetrievedChunk } from '../rag/types';
import type { SparkConversationState } from '../agents/agent-state';
import { buildQualifierPrompt } from '../prompts';
import { createToolsForAgent } from '../tools';
import type { SparkAgentRuntime } from './types';

export function createQualifierAgent(args: {
  currentDate: string;
  conversationId: string;
  state: SparkConversationState;
  retrieved: RetrievedChunk[];
}): SparkAgentRuntime {
  // Agent runtime = prompt + allowed tools. The orchestrator chooses this
  // object, then `rag/chat.ts` performs the actual model call.
  return {
    name: 'qualifier',
    system: buildQualifierPrompt(args),
    tools: createToolsForAgent('qualifier', {
      conversationId: args.conversationId,
      state: args.state,
    }),
  };
}
