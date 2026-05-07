// Internal-summary email tool, backed by Resend.
//
// Fired by the Booker after a booking, reschedule, or cancellation. The full
// chat transcript is appended to the email body so we have the conversation
// context next to the summary — chat messages aren't persisted to Postgres,
// so this email is the only durable record of what was said.

import { tool, type UIMessage } from 'ai';
import { Resend } from 'resend';
import { z } from 'zod';

// Resend's free tier allows sending without a verified domain only via
// `onboarding@resend.dev`, and only TO the address registered with the Resend
// account. Swap to a verified sender + recipient once the domain is set up.
const FROM = 'Spark <onboarding@resend.dev>';
const NOTIFY_TO = 'dimimikadze@gmail.com';

// Render UIMessage[] into a plain-text transcript. Tool calls and tool
// results are skipped — the agent's user-facing text already summarizes
// what tools did, and including the raw payloads would bloat the email.
function formatTranscript(messages: UIMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const text = m.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('\n')
      .trim();
    if (!text) continue;
    lines.push(`${m.role === 'user' ? 'User' : 'Spark'}: ${text}`);
  }
  return lines.join('\n\n');
}

export function createSendSummaryEmailTool(messages: UIMessage[]) {
  return tool({
    description:
      'Send an internal summary email to enumeral after a booking, ' +
      'reschedule, or cancellation. Used by the Booker agent only.',
    inputSchema: z.object({
      eventType: z.enum(['booking', 'reschedule', 'cancellation']),
      subject: z.string(),
      body: z.string(),
    }),
    execute: async ({ eventType, subject, body }) => {
      const transcript = formatTranscript(messages);
      const fullBody = transcript
        ? `${body}\n\n---\nTranscript:\n\n${transcript}`
        : body;

      console.info('[tool:sendSummaryEmail]', { eventType, subject, to: NOTIFY_TO });

      // Missing key in dev shouldn't crash the agent loop — log and return
      // a soft failure so the conversation continues.
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        console.warn('[tool:sendSummaryEmail] RESEND_API_KEY not set — skipping send');
        return { ok: false, status: 'skipped', reason: 'missing_api_key' };
      }

      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: NOTIFY_TO,
        subject,
        text: fullBody,
      });

      if (error) {
        console.error('[tool:sendSummaryEmail] resend error', error);
        return { ok: false, status: 'failed', error: error.message };
      }

      return { ok: true, status: 'sent', emailId: data?.id, eventType };
    },
  });
}
