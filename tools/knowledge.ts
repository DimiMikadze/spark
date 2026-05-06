// The agents' single bridge to the RAG engine.
//
// We expose retrieval as a tool (rather than stuffing chunks into the system
// prompt every turn) for two reasons:
//
//   1. Cost. The system prompt stays stable across turns, so OpenAI's
//      automatic prompt cache hits and we don't re-pay for the prefix.
//   2. Relevance. Most chit-chat doesn't need the knowledge base. Letting
//      the model decide when to search means we only pay for retrieval
//      when the user actually asks an enumeral question.

import { tool } from 'ai';
import { z } from 'zod';
import { retrieve } from '@/rag/retrieve';

export const searchKnowledge = tool({
  description:
    'Search enumeral knowledge base for facts about services, pricing, ' +
    'process, or how the team works. Call this whenever the user asks ' +
    'something about enumeral that requires factual information.',
  inputSchema: z.object({
    query: z.string().describe("The user's question, rephrased for search."),
  }),
  execute: async ({ query }) => {
    console.info('[tool:searchKnowledge]', { query });
    const chunks = await retrieve(query, 3);
    console.info('[tool:searchKnowledge] result', {
      query,
      chunks: chunks.length,
      sources: chunks.map((c) => c.source),
    });
    if (chunks.length === 0) {
      return { ok: true, found: false, chunks: [] };
    }
    return {
      ok: true,
      found: true,
      chunks: chunks.map((c) => ({ source: c.source, content: c.content })),
    };
  },
});
