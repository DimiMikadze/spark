import { sql } from './db';

// App-level DB helpers. RAG-specific queries live in rag/queries.ts.
//
// Two layers in here:
//   1. Chat session / message persistence — tied to the cookie-based session.
//   2. Lead persistence — what the Qualifier captures and the Booker updates.

// --- chat sessions / messages ---

export async function createChatSession(sessionId: string): Promise<void> {
  await sql`INSERT INTO chat_sessions (id) VALUES (${sessionId})`;
}

export async function sessionHasMessages(sessionId: string): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM messages WHERE session_id = ${sessionId} LIMIT 1
  `) as { '?column?': number }[];
  return rows.length > 0;
}

export type MessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export async function getMessagesBySession(sessionId: string): Promise<MessageRow[]> {
  return (await sql`
    SELECT id, role, content
    FROM messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC
  `) as MessageRow[];
}

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  await sql`
    INSERT INTO messages (session_id, role, content)
    VALUES (${sessionId}, ${role}, ${content})
  `;
}

// --- leads ---

export type LeadRow = {
  email: string;
  business_description: string;
  ai_need: string | null;
  calendar_event_id: string | null;
};

export async function findLeadByEmail(email: string): Promise<LeadRow | null> {
  const rows = (await sql`
    SELECT email, business_description, ai_need, calendar_event_id
    FROM leads
    WHERE email = ${email}
  `) as LeadRow[];
  return rows[0] ?? null;
}

// ON CONFLICT DO NOTHING + RETURNING gives us a clean "did this insert succeed?"
// signal: an empty result set means a row already existed, so the tool layer
// can surface a typed `lead_exists` error without us catching driver-specific
// constraint-violation codes here.
export async function insertLead(args: {
  email: string;
  businessDescription: string;
  aiNeed: string | null;
}): Promise<LeadRow | null> {
  const { email, businessDescription, aiNeed } = args;
  const rows = (await sql`
    INSERT INTO leads (email, business_description, ai_need)
    VALUES (${email}, ${businessDescription}, ${aiNeed})
    ON CONFLICT (email) DO NOTHING
    RETURNING email, business_description, ai_need, calendar_event_id
  `) as LeadRow[];
  return rows[0] ?? null;
}

// `calendarEventId` is tri-state: undefined keeps the existing value, null
// clears it (a cancellation), a string sets it. We can't express "leave alone
// vs set to NULL" through a single COALESCE, so the two cases are different
// statements. `businessDescription` and `aiNeed` only have two states — undefined
// keeps the existing value — so COALESCE handles both with one branch.
export async function updateLeadFields(args: {
  email: string;
  businessDescription?: string;
  aiNeed?: string;
  calendarEventId?: string | null;
}): Promise<LeadRow | null> {
  const { email, businessDescription, aiNeed, calendarEventId } = args;
  const bd = businessDescription ?? null;
  const an = aiNeed ?? null;

  const rows =
    calendarEventId !== undefined
      ? ((await sql`
          UPDATE leads SET
            business_description = COALESCE(${bd}, business_description),
            ai_need = COALESCE(${an}, ai_need),
            calendar_event_id = ${calendarEventId},
            updated_at = now()
          WHERE email = ${email}
          RETURNING email, business_description, ai_need, calendar_event_id
        `) as LeadRow[])
      : ((await sql`
          UPDATE leads SET
            business_description = COALESCE(${bd}, business_description),
            ai_need = COALESCE(${an}, ai_need),
            updated_at = now()
          WHERE email = ${email}
          RETURNING email, business_description, ai_need, calendar_event_id
        `) as LeadRow[]);

  return rows[0] ?? null;
}

// --- full wipe ---

// Spans both layers (RAG tables + chat tables + leads). `_migrations` stays
// untouched so re-running `pnpm db:setup` after wiping is a no-op.
export async function truncateAll(): Promise<void> {
  await sql`TRUNCATE documents, chunks, chat_sessions, messages, leads RESTART IDENTITY CASCADE`;
}
