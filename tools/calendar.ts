// Mocked Google Calendar tools.
//
// Every call always succeeds. `checkAvailability` reports the requested slot
// as free. `createEvent` returns a deterministic fake event id keyed off the
// attendee's email so subsequent reschedule/cancel flows stay self-consistent
// even without persistence.

import { tool } from 'ai';
import { z } from 'zod';

function fakeCalendarEventId(seed: string): string {
  return `mock_event_${Buffer.from(seed).toString('hex').slice(0, 12)}`;
}

export const checkAvailability = tool({
  description:
    'Check if a requested calendar slot is free. The mock always reports ' +
    'the slot as available.',
  inputSchema: z.object({
    requestedTime: z
      .string()
      .describe('Requested date and time, written clearly with the correct year.'),
    city: z.string().describe("The user's city, used to derive timezone."),
    timezone: z.string().describe('IANA timezone, e.g. Europe/London.'),
    durationMinutes: z.number().int().positive().default(30),
  }),
  execute: async (input) => {
    console.info('[tool:checkAvailability]', input);
    return { ok: true, status: 'available', ...input };
  },
});

export const createEvent = tool({
  description: 'Create a Google Calendar event for an enumeral intro call.',
  inputSchema: z.object({
    title: z.string().default('enumeral intro call'),
    attendeeEmail: z.email(),
    startTime: z.string(),
    city: z.string(),
    timezone: z.string(),
    durationMinutes: z.number().int().positive().default(30),
  }),
  execute: async (input) => {
    console.info('[tool:createEvent]', input);
    return {
      ok: true,
      status: 'created',
      calendarEventId: fakeCalendarEventId(input.attendeeEmail),
      ...input,
    };
  },
});

export const updateEvent = tool({
  description: 'Update an existing Google Calendar event for a reschedule.',
  inputSchema: z.object({
    calendarEventId: z.string(),
    newStartTime: z.string(),
    city: z.string(),
    timezone: z.string(),
    durationMinutes: z.number().int().positive().default(30),
  }),
  execute: async (input) => {
    console.info('[tool:updateEvent]', input);
    return { ok: true, status: 'updated', ...input };
  },
});

export const deleteEvent = tool({
  description: 'Delete a Google Calendar event for a cancellation.',
  inputSchema: z.object({
    calendarEventId: z.string(),
  }),
  execute: async (input) => {
    console.info('[tool:deleteEvent]', input);
    return { ok: true, status: 'deleted', ...input };
  },
});
