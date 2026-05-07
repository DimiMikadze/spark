// Per-agent tool permissions.
//
// Tool access is the main guardrail between agents. Qualifier can write
// leads but cannot touch the calendar; Booker can manage the calendar but
// cannot create leads. Greeter never reaches the model so it has none.

import type { ToolSet, UIMessage } from 'ai';
import type { ConversationState, SparkAgentName } from '@/types';
import { checkAvailability, createEvent, deleteEvent, updateEvent } from './calendar';
import { createSendSummaryEmailTool } from './email';
import { createHandoffToBookerTool } from './handoff';
import { searchKnowledge } from './knowledge';
import { createLead, findLead, updateLead } from './leads';

export function createToolsForAgent(
  agent: SparkAgentName,
  state: ConversationState,
  messages: UIMessage[],
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
      sendSummaryEmail: createSendSummaryEmailTool(messages),
    };
  }

  return undefined;
}
