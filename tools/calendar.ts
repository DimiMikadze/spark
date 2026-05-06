import { tool } from 'ai';
import { z } from 'zod';
import { recordToolEvent } from '../agents/agent-state';
import type { ToolFactoryContext } from './types';

function eventIdFrom(input: string): string {
  // Stable enough for test transcripts, deterministic enough to inspect.
  return `mock_event_${Buffer.from(input).toString('hex').slice(0, 12)}`;
}

export function createCheckAvailabilityTool(ctx: ToolFactoryContext) {
  return tool({
    description: 'Mock calendar availability check. It always marks the requested slot as available.',
    inputSchema: z.object({
      requestedTime: z.string().describe('The date and time the user requested, written clearly with the correct year'),
      city: z.string().describe("The user's city"),
      timezone: z.string().describe('IANA timezone for the city, e.g. Europe/London'),
      durationMinutes: z.number().int().positive().default(30),
    }),
    execute: async ({ requestedTime, city, timezone, durationMinutes }) => {
      // The mock intentionally never blocks booking. We are testing whether the
      // agent calls the tool, not real calendar availability yet.
      const output = {
        mock: true,
        status: 'available',
        requestedTime,
        city,
        timezone,
        durationMinutes,
        message: 'Requested slot is available.',
      };

      recordToolEvent(
        ctx.state,
        ctx.agent,
        'checkAvailability',
        { requestedTime, city, timezone, durationMinutes },
        output,
      );
      return output;
    },
  });
}

export function createCreateEventTool(ctx: ToolFactoryContext) {
  return tool({
    description: 'Mock Google Calendar event creation for an enumeral intro call.',
    inputSchema: z.object({
      title: z.string().default('enumeral intro call'),
      attendeeEmail: z.string().email().describe("The user's email address"),
      startTime: z.string().describe('The selected date and time, written clearly with the correct year'),
      city: z.string().describe("The user's city"),
      timezone: z.string().describe('IANA timezone for the city'),
      durationMinutes: z.number().int().positive().default(30),
    }),
    execute: async ({ title, attendeeEmail, startTime, city, timezone, durationMinutes }) => {
      const calendarEventId = eventIdFrom(`${attendeeEmail}:${startTime}`);
      // Keep state in sync so the next mocked lead update can save the event id.
      ctx.state.lead.email = attendeeEmail.toLowerCase();
      ctx.state.lead.calendarEventId = calendarEventId;

      const output = {
        mock: true,
        status: 'created',
        calendarEventId,
        title,
        attendeeEmail: attendeeEmail.toLowerCase(),
        startTime,
        city,
        timezone,
        durationMinutes,
        eventLink: `https://calendar.google.com/calendar/event?eid=${calendarEventId}`,
      };

      recordToolEvent(
        ctx.state,
        ctx.agent,
        'createEvent',
        { title, attendeeEmail, startTime, city, timezone, durationMinutes },
        output,
      );
      return output;
    },
  });
}

export function createUpdateEventTool(ctx: ToolFactoryContext) {
  return tool({
    description: 'Mock Google Calendar event update for rescheduling.',
    inputSchema: z.object({
      calendarEventId: z.string().describe('Existing calendar event id'),
      newStartTime: z.string().describe('The new selected date and time, written clearly with the correct year'),
      city: z.string().describe("The user's city"),
      timezone: z.string().describe('IANA timezone for the city'),
      durationMinutes: z.number().int().positive().default(30),
    }),
    execute: async ({ calendarEventId, newStartTime, city, timezone, durationMinutes }) => {
      ctx.state.lead.calendarEventId = calendarEventId;

      const output = {
        mock: true,
        status: 'updated',
        calendarEventId,
        newStartTime,
        city,
        timezone,
        durationMinutes,
      };

      recordToolEvent(
        ctx.state,
        ctx.agent,
        'updateEvent',
        { calendarEventId, newStartTime, city, timezone, durationMinutes },
        output,
      );
      return output;
    },
  });
}

export function createDeleteEventTool(ctx: ToolFactoryContext) {
  return tool({
    description: 'Mock Google Calendar event deletion for cancellations.',
    inputSchema: z.object({
      calendarEventId: z.string().describe('Existing calendar event id'),
    }),
    execute: async ({ calendarEventId }) => {
      ctx.state.lead.calendarEventId = null;

      const output = {
        mock: true,
        status: 'deleted',
        calendarEventId,
      };

      recordToolEvent(ctx.state, ctx.agent, 'deleteEvent', { calendarEventId }, output);
      return output;
    },
  });
}
