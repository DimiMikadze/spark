// App-wide types for Spark.
//
// RAG-only types live in `rag/types.ts` so the RAG engine stays portable —
// nothing under `rag/` should import from this file.

import type { ToolSet } from 'ai';

// Greeter is an explicit agent so the conversation lifecycle is honest about
// who handled the first turn, even though Greeter never calls the LLM.
export type SparkAgentName = 'greeter' | 'qualifier' | 'booker';

// What the user is trying to do once they land in Booker. Set by the Qualifier
// when it hands off, so Booker doesn't have to re-classify intent.
export type BookingIntent = 'new_booking' | 'reschedule' | 'cancel';

// Pending handoff requested by the active agent's tool call. The orchestrator
// applies it after the model finishes its current step.
export type HandoffSignal = {
  target: SparkAgentName;
  reason: BookingIntent;
};

// Per-conversation runtime state. Lives in memory only — page refresh or
// server restart resets it. Persisting to Postgres is a future task.
export type ConversationState = {
  conversationId: string;
  activeAgent: SparkAgentName;
  pendingHandoff?: HandoffSignal;
};

// What an agent factory returns. The orchestrator calls `streamText` with
// these fields and nothing else. Greeter sets `tools` to undefined because
// it never reaches the model.
export type SparkAgentRuntime = {
  name: SparkAgentName;
  system: string;
  tools?: ToolSet;
};
