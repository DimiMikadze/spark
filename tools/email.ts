// Mocked internal-summary email tool.
//
// In production this calls the team's email service. For v1 it just logs
// the payload so we can inspect what the agent would have sent.

import { tool } from 'ai';
import { z } from 'zod';

export const sendSummaryEmail = tool({
  description:
    'Send an internal summary email to enumeral after a booking, ' +
    'reschedule, or cancellation. Used by the Booker agent only.',
  inputSchema: z.object({
    eventType: z.enum(['booking', 'reschedule', 'cancellation']),
    subject: z.string(),
    body: z.string(),
    to: z.email().default('dimi@enumeral.ai'),
  }),
  execute: async (input) => {
    console.info('[tool:sendSummaryEmail]', input);
    return { ok: true, status: 'sent', emailId: `mock_email_${Date.now()}`, ...input };
  },
});
