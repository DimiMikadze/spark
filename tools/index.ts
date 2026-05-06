// Per-agent tool permissions.
//
// Tool access is the main guardrail between agents. Qualifier can write
// leads but cannot touch the calendar; Booker can manage the calendar but
// cannot create leads. Greeter never reaches the model so it has none.

import type { ToolSet } from 'ai';
import type { ConversationState, SparkAgentName } from '@/types';
import { checkAvailability, createEvent, deleteEvent, updateEvent } from './calendar';
import { sendSummaryEmail } from './email';
import { createHandoffToBookerTool } from './handoff';
import { searchKnowledge } from './knowledge';
import { createLead, findLead, updateLead } from './lead';

export function createToolsForAgent(
  agent: SparkAgentName,
  state: ConversationState,
): ToolSet | undefined {
  if (agent === 'qualifier') {
    return {
      searchKnowledge,
      findLead,
      createLead,
      updateLead,
      handoffToBooker: createHandoffToBookerTool(state),
    };
  }

  if (agent === 'booker') {
    return {
      searchKnowledge,
      findLead,
      updateLead,
      checkAvailability,
      createEvent,
      updateEvent,
      deleteEvent,
      sendSummaryEmail,
    };
  }

  return undefined;
}
