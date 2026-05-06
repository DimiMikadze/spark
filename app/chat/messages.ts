import type { UIMessage } from 'ai';
import { SPARK_GREETING, SPARK_RETURNING_GREETING } from '@/agents/greeter/agent';

// The first greeting is static product copy, not an LLM response. Refreshing
// the page returns to one of two clean starting points — first-timer or
// returning visitor — based on whether the session cookie is set.
export function buildInitialMessages({ returning }: { returning: boolean }): UIMessage[] {
  return [
    {
      id: 'spark-greeting',
      role: 'assistant',
      parts: [{ type: 'text', text: returning ? SPARK_RETURNING_GREETING : SPARK_GREETING }],
    },
  ];
}
