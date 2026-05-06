// The Greeter agent owns the static welcome line.
//
// It never calls the LLM. The Next.js client seeds `SPARK_GREETING` as the
// first assistant message, so the user sees the greeting on page load with
// zero round-trip. On the server side, Greeter exists to mark "we have
// greeted" and transition to Qualifier so the user's first real message
// routes correctly. Splitting it into a real agent (rather than baking it
// into the orchestrator) keeps the lifecycle honest and leaves a clean home
// for future "remember the user" logic.

import type { ConversationState } from '@/types';

export const SPARK_GREETING =
  "Hi! I'm Spark, AI assistant for enumeral. Before we set up a call, I'd love to learn a bit about your business. What does your company do?";

// Shown instead of SPARK_GREETING when the visitor's session cookie is
// already set. We don't restore prior chat history, so the copy stays
// open-ended rather than promising to "pick up where we left off".
export const SPARK_RETURNING_GREETING =
  'Welcome back! What can I help with today?';

// Called by the orchestrator when the active agent is Greeter and a user
// message has just arrived. No tokens spent — we just flip state and let
// the orchestrator run the Qualifier on this same turn.
export function runGreeter(state: ConversationState): void {
  console.info('[greeter]', `${state.conversationId}: greeted, handing off to qualifier`);
  state.activeAgent = 'qualifier';
}
