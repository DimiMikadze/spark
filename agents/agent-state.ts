import type { UIMessage } from 'ai';
import { SPARK_GREETING } from '../prompts/shared';
import type { BookingIntent, SparkAgentName } from '../agents/types';

export type LeadState = {
  id?: string;
  email?: string;
  businessDescription?: string;
  aiNeed?: string;
  conversationId?: string;
  calendarEventId?: string | null;
  qualificationStatus?: 'unknown' | 'qualified' | 'unqualified';
  saved?: boolean;
};

export type ToolEvent = {
  id: string;
  agent: SparkAgentName;
  toolName: string;
  input: unknown;
  output: unknown;
  createdAt: string;
};

export type SparkConversationState = {
  conversationId: string;
  activeAgent: SparkAgentName;
  bookingIntent: BookingIntent;
  lead: LeadState;
  toolEvents: ToolEvent[];
};

export type MockLead = Required<Pick<LeadState, 'id' | 'email'>> & Omit<LeadState, 'id' | 'email'>;

// Temporary in-memory stores for the mock phase. They deliberately reset when
// the dev server restarts and will be replaced by real integrations later.
const conversationStates = new Map<string, SparkConversationState>();
const mockLeads = new Map<string, MockLead>();

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function extractText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

function latestUserText(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return lastUser ? extractText(lastUser) : '';
}

function hasGreeting(messages: UIMessage[]): boolean {
  return messages.some((m) => m.role === 'assistant' && extractText(m).includes(SPARK_GREETING));
}

function isFreshConversationStart(messages: UIMessage[]): boolean {
  const userCount = messages.filter((m) => m.role === 'user').length;
  // Refreshing the page seeds only the static greeting. The first post after
  // that should not inherit stale in-memory state from an old cookie.
  return hasGreeting(messages) && userCount <= 1 && messages.length <= 2;
}

function detectBookingIntent(text: string): BookingIntent {
  const normalized = text.toLowerCase();
  if (/\b(cancel|cancelled|cancellation|delete)\b/.test(normalized)) return 'cancel';
  if (/\b(reschedule|move|change|update)\b/.test(normalized)) return 'reschedule';
  return 'none';
}

function extractEmail(text: string): string | undefined {
  return text.match(EMAIL_RE)?.[0]?.toLowerCase();
}

function createInitialState(conversationId: string): SparkConversationState {
  return {
    conversationId,
    activeAgent: 'qualifier',
    bookingIntent: 'none',
    lead: { conversationId, qualificationStatus: 'unknown' },
    toolEvents: [],
  };
}

export function getConversationState(conversationId: string, messages: UIMessage[]): SparkConversationState {
  const existing = conversationStates.get(conversationId);
  const state = existing && !isFreshConversationStart(messages) ? existing : createInitialState(conversationId);
  conversationStates.set(conversationId, state);
  applyMessageHeuristics(state, messages);
  return state;
}

export function applyMessageHeuristics(state: SparkConversationState, messages: UIMessage[]): void {
  const text = latestUserText(messages);
  if (!text) return;

  // The router needs a few cheap facts before the LLM runs: booking-change
  // intent and email. Everything deeper stays in the agent prompt/tools.
  const intent = detectBookingIntent(text);
  if (intent !== 'none') {
    state.bookingIntent = intent;
  }

  const email = extractEmail(text);
  if (email) {
    state.lead.email = email;
  }

  if (state.activeAgent === 'qualifier' && state.bookingIntent !== 'none' && state.lead.email) {
    state.activeAgent = 'booker';
  }
}

export function transitionToAgent(state: SparkConversationState, activeAgent: SparkAgentName): void {
  state.activeAgent = activeAgent;
}

export function recordToolEvent(
  state: SparkConversationState,
  agent: SparkAgentName,
  toolName: string,
  input: unknown,
  output: unknown,
): ToolEvent {
  // `/chat` reads these events through message metadata so we can verify
  // whether the agent used the right mocked tool.
  const event = {
    id: `tool_${Date.now()}_${state.toolEvents.length + 1}`,
    agent,
    toolName,
    input,
    output,
    createdAt: new Date().toISOString(),
  };

  state.toolEvents = [...state.toolEvents.slice(-19), event];
  return event;
}

export function snapshotConversationState(conversationId: string): SparkConversationState | undefined {
  const state = conversationStates.get(conversationId);
  if (!state) return undefined;
  return JSON.parse(JSON.stringify(state)) as SparkConversationState;
}

export function findMockLeadByEmail(email: string): MockLead | undefined {
  return mockLeads.get(email.toLowerCase());
}

export function saveMockLead(lead: MockLead): MockLead {
  mockLeads.set(lead.email.toLowerCase(), lead);
  return lead;
}

export function createMockLead(args: {
  email: string;
  businessDescription?: string;
  aiNeed?: string;
  conversationId?: string;
  calendarEventId?: string | null;
}): MockLead {
  return saveMockLead({
    id: `mock_lead_${Buffer.from(args.email).toString('hex').slice(0, 12)}`,
    email: args.email.toLowerCase(),
    businessDescription: args.businessDescription,
    aiNeed: args.aiNeed,
    conversationId: args.conversationId,
    calendarEventId: args.calendarEventId,
    qualificationStatus: 'qualified',
    saved: true,
  });
}

export function seedMockBooking(email: string, conversationId: string): MockLead {
  const existing = findMockLeadByEmail(email);
  if (existing?.calendarEventId) return existing;

  // Reschedule/cancel tests need a booking to find even before real DB
  // persistence exists, so the mock lookup creates a realistic event id.
  return createMockLead({
    email,
    businessDescription: existing?.businessDescription ?? 'Existing customer booking lookup mock',
    aiNeed: existing?.aiNeed,
    conversationId: existing?.conversationId ?? conversationId,
    calendarEventId: existing?.calendarEventId ?? `mock_event_${Buffer.from(email).toString('hex').slice(0, 12)}`,
  });
}
