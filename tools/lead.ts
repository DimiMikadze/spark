// Mocked lead-database tools.
//
// In v1 these are pure stubs: they `console.log` the call so we can trace
// the agent's behavior in the dev terminal, then return `{ ok: true, ... }`.
// Wiring real Postgres writes later means editing only this file.

import { tool } from 'ai';
import { z } from 'zod';

// A deterministic fake calendar event id keyed off the email lets reschedule
// and cancel flows have something realistic to echo around. Real impl
// replaces this with the id returned by Google Calendar.
function fakeCalendarEventId(email: string): string {
  return `mock_event_${Buffer.from(email).toString('hex').slice(0, 12)}`;
}

export const findLead = tool({
  description:
    'Look up an existing enumeral lead by email. Use before creating, ' +
    'updating, rescheduling, or cancelling.',
  inputSchema: z.object({
    email: z.email(),
  }),
  execute: async ({ email }) => {
    console.info('[tool:findLead]', { email });
    // The mock always claims the lead exists with a matching calendar event,
    // so reschedule/cancel flows can proceed without real persistence.
    return {
      ok: true,
      found: true,
      email,
      calendarEventId: fakeCalendarEventId(email),
    };
  },
});

export const createLead = tool({
  description:
    'Create a qualified enumeral lead. Only the Qualifier agent uses this.',
  inputSchema: z.object({
    email: z.email(),
    businessDescription: z.string(),
    aiNeed: z.string().optional(),
  }),
  execute: async (input) => {
    console.info('[tool:createLead]', input);
    return { ok: true, ...input };
  },
});

export const updateLead = tool({
  description:
    'Update fields on an existing lead. Used after qualifying to refresh ' +
    'business info, and after booking to set or clear the calendar event id.',
  inputSchema: z.object({
    email: z.email(),
    businessDescription: z.string().optional(),
    aiNeed: z.string().optional(),
    // Pass null to clear after a cancellation.
    calendarEventId: z.string().nullable().optional(),
  }),
  execute: async (input) => {
    console.info('[tool:updateLead]', input);
    return { ok: true, ...input };
  },
});
