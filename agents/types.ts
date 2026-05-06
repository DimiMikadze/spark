import type { ToolSet } from 'ai';

export type SparkAgentName = 'qualifier' | 'booker';

export type BookingIntent = 'new_booking' | 'reschedule' | 'cancel' | 'none';

export type SparkAgentRuntime = {
  name: SparkAgentName;
  system: string;
  tools?: ToolSet;
};
