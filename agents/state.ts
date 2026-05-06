// In-memory per-conversation state.
//
// This is the only place that mutates `activeAgent`. Tools record handoff
// intent here; the orchestrator applies it before the next turn. Persisting
// to Postgres is a future task — for v1, restarting the dev server
// intentionally clears all conversations.

import type { BookingIntent, ConversationState, SparkAgentName } from '@/types';

const states = new Map<string, ConversationState>();

function createInitialState(conversationId: string): ConversationState {
  return {
    conversationId,
    // Default to Greeter so the first turn of any new conversation is
    // observable as "we greeted them, then handed off".
    activeAgent: 'greeter',
  };
}

export function getOrCreateState(conversationId: string): ConversationState {
  let state = states.get(conversationId);
  if (!state) {
    state = createInitialState(conversationId);
    states.set(conversationId, state);
  }
  return state;
}

export function recordHandoff(
  state: ConversationState,
  target: SparkAgentName,
  reason: BookingIntent,
): void {
  state.pendingHandoff = { target, reason };
}

export function applyPendingHandoff(state: ConversationState): void {
  if (!state.pendingHandoff) return;
  state.activeAgent = state.pendingHandoff.target;
  state.pendingHandoff = undefined;
}

export function snapshotState(conversationId: string): ConversationState | undefined {
  const state = states.get(conversationId);
  if (!state) return undefined;
  // Defensive deep copy so the debug panel can't mutate live state.
  return JSON.parse(JSON.stringify(state)) as ConversationState;
}
