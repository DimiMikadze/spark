// Agent handoff is an explicit tool call, not a regex over user text.
//
// The Qualifier agent decides when the conversation should move to the
// Booker (qualified lead, or reschedule/cancel intent with email collected)
// and emits this tool call. The orchestrator inspects `state.pendingHandoff`
// after the model finishes its current step and updates `activeAgent` so the
// next user turn routes to Booker.

import { tool } from 'ai';
import { z } from 'zod';
import type { ConversationState } from '@/types';
import { recordHandoff } from '@/agents/state';

export function createHandoffToBookerTool(state: ConversationState) {
  return tool({
    description:
      'Hand the conversation off to the Booker agent. Call this after a ' +
      'qualified lead has been saved, or after the user has stated they ' +
      'want to reschedule or cancel and you have collected their email. ' +
      'After calling this, send one short message telling the user a ' +
      'booking assistant will help them, then stop.',
    inputSchema: z.object({
      reason: z.enum(['new_booking', 'reschedule', 'cancel']),
      email: z.email(),
    }),
    execute: async ({ reason, email }) => {
      console.info('[tool:handoffToBooker]', { reason, email });
      recordHandoff(state, 'booker', reason);
      return { ok: true, target: 'booker', reason };
    },
  });
}
