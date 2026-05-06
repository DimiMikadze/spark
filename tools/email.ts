import { tool } from 'ai';
import { z } from 'zod';
import { recordToolEvent } from '../agents/agent-state';
import type { ToolFactoryContext } from './types';

export function createSendSummaryEmailTool(ctx: ToolFactoryContext) {
  return tool({
    description: 'Mock sending an internal summary email to enumeral after booking, reschedule, or cancellation.',
    inputSchema: z.object({
      eventType: z.enum(['booking', 'reschedule', 'cancellation']),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Concise internal summary email body'),
      to: z.string().email().default('dimi@enumeral.ai'),
    }),
    execute: async ({ eventType, subject, body, to }) => {
      // No email leaves the app in v1. The returned body is exposed in debug
      // metadata so we can judge whether the summary is useful.
      const output = {
        mock: true,
        status: 'sent',
        emailId: `mock_email_${Date.now()}`,
        to,
        eventType,
        subject,
        body,
      };

      recordToolEvent(ctx.state, ctx.agent, 'sendSummaryEmail', { eventType, subject, body, to }, output);
      return output;
    },
  });
}
