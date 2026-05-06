import { tool } from 'ai';
import { z } from 'zod';
import {
  createMockLead,
  findMockLeadByEmail,
  recordToolEvent,
  saveMockLead,
  seedMockBooking,
  transitionToAgent,
} from '../agents/agent-state';
import type { ToolFactoryContext } from './types';

function cleanEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createFindLeadByEmailTool(ctx: ToolFactoryContext) {
  return tool({
    description:
      'Mock lookup for an enumeral lead by email. Use before creating, updating, rescheduling, or cancelling.',
    inputSchema: z.object({
      email: z.string().email().describe('Lead email address'),
    }),
    execute: async ({ email }) => {
      const normalizedEmail = cleanEmail(email);
      // For reschedule/cancel, the mock behaves as if an existing booking can
      // be found by email. New lead qualification still uses real found/missing.
      const existing =
        ctx.state.bookingIntent === 'reschedule' || ctx.state.bookingIntent === 'cancel'
          ? seedMockBooking(normalizedEmail, ctx.conversationId)
          : findMockLeadByEmail(normalizedEmail);

      if (existing) {
        ctx.state.lead = { ...ctx.state.lead, ...existing };
      } else {
        ctx.state.lead.email = normalizedEmail;
      }

      const output = existing
        ? { mock: true, found: true, lead: existing }
        : { mock: true, found: false, email: normalizedEmail };

      recordToolEvent(ctx.state, ctx.agent, 'findLeadByEmail', { email }, output);
      return output;
    },
  });
}

export function createCreateLeadTool(ctx: ToolFactoryContext) {
  return tool({
    description: 'Mock creation of a qualified enumeral lead. Only the Qualifier agent may use this.',
    inputSchema: z.object({
      email: z.string().email().describe('Lead email address'),
      businessDescription: z.string().describe("What the user's company does"),
      aiNeed: z.string().optional().describe('The AI use case or need, if the user shared one'),
      conversationId: z
        .string()
        .optional()
        .describe('Conversation id. Use the current conversation id when available.'),
    }),
    execute: async ({ email, businessDescription, aiNeed, conversationId }) => {
      const lead = createMockLead({
        email: cleanEmail(email),
        businessDescription,
        aiNeed,
        conversationId: conversationId ?? ctx.conversationId,
      });

      ctx.state.lead = { ...ctx.state.lead, ...lead };
      ctx.state.bookingIntent = 'new_booking';
      // A saved qualified lead is the handoff point from Qualifier to Booker.
      transitionToAgent(ctx.state, 'booker');

      const output = {
        mock: true,
        status: 'created',
        lead,
      };

      recordToolEvent(
        ctx.state,
        ctx.agent,
        'createLead',
        { email, businessDescription, aiNeed, conversationId },
        output,
      );
      return output;
    },
  });
}

export function createUpdateLeadTool(ctx: ToolFactoryContext) {
  return tool({
    description: 'Mock update for an existing lead. Use for qualified lead updates and booking event ids.',
    inputSchema: z.object({
      email: z.string().email().describe('Lead email address'),
      businessDescription: z.string().optional(),
      aiNeed: z.string().optional(),
      conversationId: z.string().optional(),
      calendarEventId: z
        .string()
        .nullable()
        .optional()
        .describe('Calendar event id. Pass null to clear it after cancellation.'),
      qualificationStatus: z.enum(['unknown', 'qualified', 'unqualified']).optional(),
    }),
    execute: async ({ email, businessDescription, aiNeed, conversationId, calendarEventId, qualificationStatus }) => {
      const normalizedEmail = cleanEmail(email);
      const existing =
        findMockLeadByEmail(normalizedEmail) ??
        createMockLead({
          email: normalizedEmail,
          conversationId: conversationId ?? ctx.conversationId,
        });

      const lead = saveMockLead({
        ...existing,
        businessDescription: businessDescription ?? existing.businessDescription,
        aiNeed: aiNeed ?? existing.aiNeed,
        conversationId: conversationId ?? existing.conversationId ?? ctx.conversationId,
        calendarEventId: calendarEventId === undefined ? existing.calendarEventId : calendarEventId,
        qualificationStatus: qualificationStatus ?? existing.qualificationStatus,
        saved: true,
      });

      ctx.state.lead = { ...ctx.state.lead, ...lead };
      if (ctx.agent === 'qualifier' && lead.qualificationStatus === 'qualified') {
        ctx.state.bookingIntent = 'new_booking';
        // Updating an existing qualified lead should hand off the same way as
        // creating one.
        transitionToAgent(ctx.state, 'booker');
      }

      const output = {
        mock: true,
        status: 'updated',
        lead,
      };

      recordToolEvent(
        ctx.state,
        ctx.agent,
        'updateLead',
        {
          email,
          businessDescription,
          aiNeed,
          conversationId,
          calendarEventId,
          qualificationStatus,
        },
        output,
      );
      return output;
    },
  });
}
