import type { RetrievedChunk } from '../rag/types';
import type { SparkConversationState } from '../agents/agent-state';
import { createBookerAgent } from './booker';
import { createQualifierAgent } from './qualifier';
import type { SparkAgentName, SparkAgentRuntime } from './types';

export function selectAgent(state: SparkConversationState): SparkAgentName {
  // Routing is intentionally deterministic. Do not ask an LLM which agent to
  // use unless the state machine becomes too limited.
  return state.activeAgent;
}

export function createAgentRuntime(args: {
  agentName: SparkAgentName;
  currentDate: string;
  conversationId: string;
  state: SparkConversationState;
  retrieved: RetrievedChunk[];
}): SparkAgentRuntime {
  if (args.agentName === 'booker') {
    return createBookerAgent(args);
  }

  return createQualifierAgent(args);
}
