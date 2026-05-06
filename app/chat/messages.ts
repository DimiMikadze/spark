import type { UIMessage } from 'ai';
import { SPARK_GREETING } from '@/agents/greeter/agent';

// The first greeting is static product copy, not an LLM response. Refreshing
// the page should always return to this clean starting point.
const greetingMessage: UIMessage = {
  id: 'spark-greeting',
  role: 'assistant',
  parts: [{ type: 'text', text: SPARK_GREETING }],
};

export function buildInitialMessages(): UIMessage[] {
  return [greetingMessage];
}
