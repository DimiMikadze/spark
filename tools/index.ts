import type { ToolSet } from 'ai';
import type { SparkAgentName } from '../agents/types';
import { createCheckAvailabilityTool, createCreateEventTool, createDeleteEventTool, createUpdateEventTool } from './calendar';
import { createSendSummaryEmailTool } from './email';
import { createCreateLeadTool, createFindLeadByEmailTool, createUpdateLeadTool } from './lead';
import type { ToolFactoryContext } from './types';

export function createToolsForAgent(
  agent: SparkAgentName,
  ctx: Omit<ToolFactoryContext, 'agent'>,
): ToolSet | undefined {
  const toolContext = { ...ctx, agent };

  // Tool permissions are the main guardrail between agents. Qualifier can
  // create leads, but it cannot touch calendar or email tools.
  if (agent === 'qualifier') {
    return {
      findLeadByEmail: createFindLeadByEmailTool(toolContext),
      createLead: createCreateLeadTool(toolContext),
      updateLead: createUpdateLeadTool(toolContext),
    };
  }

  // Booker can update existing lead booking fields, but it cannot create a
  // lead. That keeps lead qualification owned by Qualifier.
  if (agent === 'booker') {
    return {
      findLeadByEmail: createFindLeadByEmailTool(toolContext),
      updateLead: createUpdateLeadTool(toolContext),
      checkAvailability: createCheckAvailabilityTool(toolContext),
      createEvent: createCreateEventTool(toolContext),
      updateEvent: createUpdateEventTool(toolContext),
      deleteEvent: createDeleteEventTool(toolContext),
      sendSummaryEmail: createSendSummaryEmailTool(toolContext),
    };
  }

  return undefined;
}
