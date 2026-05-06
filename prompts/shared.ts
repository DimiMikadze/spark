import type { RetrievedChunk } from '../rag/types';
import type { SparkConversationState } from '../agents/agent-state';

export const SPARK_GREETING =
  "Hi! I'm Spark, AI assistant for enumeral. Before we set up a call, I'd love to learn a bit about your business. What does your company do?";

export function formatRetrievedContext(retrieved: RetrievedChunk[]): string {
  if (retrieved.length === 0) return '(no relevant enumeral context found)';

  return retrieved.map((r, i) => `[${i + 1}] source: ${r.source}\n${r.content}`).join('\n\n---\n\n');
}

export function formatState(state: SparkConversationState): string {
  return JSON.stringify(
    {
      activeAgent: state.activeAgent,
      bookingIntent: state.bookingIntent,
      lead: state.lead,
    },
    null,
    2,
  );
}

export function buildKnowledgeInstructions(retrieved: RetrievedChunk[]): string {
  return `Enumeral context:
${formatRetrievedContext(retrieved)}

Use the enumeral context only for questions about enumeral, services, pricing, process, or how the team works.
If the context does not contain the answer, say you are not sure and offer dimi@enumeral.ai.
Never mention "knowledge base", "RAG", "retrieved context", "database", "tool", or internal records to the user.`;
}

export const SHARED_STYLE_RULES = `Conversation style:
- Always respond in the same language the user is writing in.
- Keep messages short, 1 to 3 sentences max.
- Sound like a real person, not a bot.
- Send one assistant message per turn, then stop.
- Ask one thing at a time when possible.
- Never use em dashes.
- Never say: "Got it", "Great", "Great question", "I'd be happy to help", "Absolutely", "ask me anything", "No worries", "That makes sense", "Makes sense".
- Avoid similar filler phrases.
- Do not give speeches.
- Do not summarize the conversation unless sending the internal email tool.
- Do not explain internal workflow or tool use.`;
