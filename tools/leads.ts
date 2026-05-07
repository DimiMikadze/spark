// Lead persistence tools — backed by the `leads` table in Postgres.
//
// Three calls correspond to three points in the lead's lifecycle:
//   - createLead  — Qualifier inserts a fresh row after collecting email + business
//   - findLead    — Booker reads back the row to recover calendarEventId on
//                   reschedule / cancel
//   - updateLead  — Booker stamps calendarEventId after createEvent, or clears
//                   it on cancel; either side may patch businessDescription /
//                   aiNeed if the user revises them mid-conversation
//
// All three return small JSON shapes the model reads. We never throw out of
// `execute` — a thrown error breaks the agent's tool loop, while `{ ok: false,
// error: '...' }` is a result the model can reason about and recover from.

import { tool } from 'ai';
import { z } from 'zod';
import { findLeadByEmail, insertLead, updateLeadFields } from '@/lib/queries';

export const findLead = tool({
  description:
    'Look up an existing enumeral lead by email to retrieve their stored ' +
    'calendarEventId. Only call this when the user wants to RESCHEDULE or ' +
    'CANCEL an existing booking. Do not call this when creating a new ' +
    'booking, qualifying a new lead, or as a duplicate check before saving.',
  inputSchema: z.object({
    email: z.email().describe(
      'The user\'s email address as they typed it in the conversation. ' +
        'Never invent, guess, or derive an email from phrases like "book me a meeting".',
    ),
  }),
  execute: async ({ email }) => {
    console.info('[tool:findLead]', { email });
    const row = await findLeadByEmail(email);
    if (!row) return { ok: true, found: false, email };
    return {
      ok: true,
      found: true,
      email: row.email,
      calendarEventId: row.calendar_event_id,
    };
  },
});

export const createLead = tool({
  description:
    'Create a qualified enumeral lead. Only the Qualifier agent uses this. ' +
    'Call directly once you have the user\'s email and business description — ' +
    'do not call findLead first.',
  inputSchema: z.object({
    email: z.email().describe(
      'The user\'s email address as they typed it in the conversation. ' +
        'Never invent, guess, or derive an email.',
    ),
    businessDescription: z.string(),
    aiNeed: z.string().optional(),
  }),
  execute: async ({ email, businessDescription, aiNeed }) => {
    console.info('[tool:createLead]', { email, businessDescription, aiNeed });
    const row = await insertLead({
      email,
      businessDescription,
      aiNeed: aiNeed ?? null,
    });
    if (!row) {
      // Duplicate email. The Qualifier prompt promises one createLead per
      // conversation, so this usually means the user is starting a fresh
      // chat with an email we already qualified — surface it so the agent
      // can pivot to "welcome back" instead of pretending to insert.
      return { ok: false, error: 'lead_exists', email };
    }
    return {
      ok: true,
      email: row.email,
      businessDescription: row.business_description,
      aiNeed: row.ai_need,
    };
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
    const row = await updateLeadFields(input);
    if (!row) {
      // Row missing means the Booker (or Qualifier) is trying to update a
      // lead that was never created — a flow bug. Returning the error
      // instead of throwing keeps the agent loop alive so the model can
      // recover (typically by asking the user to re-qualify).
      return { ok: false, error: 'lead_not_found', email: input.email };
    }
    return {
      ok: true,
      email: row.email,
      businessDescription: row.business_description,
      aiNeed: row.ai_need,
      calendarEventId: row.calendar_event_id,
    };
  },
});
