import type { SparkConversationState } from '../agents/agent-state';
import type { SparkAgentName } from '../agents/types';

export type ToolFactoryContext = {
  agent: SparkAgentName;
  conversationId: string;
  state: SparkConversationState;
};
