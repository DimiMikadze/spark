import type { RetrievedChunk } from './types';

// The base instructions for the chat model. Kept terse on purpose: long
// system prompts dilute the model's attention to the actual user question.
// The CONTEXT block is appended by buildRagSystem at request time.
const RAG_SYSTEM_INSTRUCTIONS = `You are a helpful assistant answering questions strictly from the CONTEXT provided below.

Rules:
- Ground every answer in the CONTEXT. Do not use outside knowledge.
- If the CONTEXT does not contain enough information, reply: "I don't know based on the provided documents."
- Cite the filename(s) you used. Be concise.`;

// Joins retrieved chunks into a readable block. We include the source path on
// each chunk so the model can cite it back to the user — without this the model
// can answer correctly but has nothing to cite from.
function formatContext(retrieved: RetrievedChunk[]): string {
  if (retrieved.length === 0) return '(no relevant context found)';
  return retrieved
    .map((r, i) => `[${i + 1}] source: ${r.source}\n${r.content}`)
    .join('\n\n---\n\n');
}

export function buildRagSystem(retrieved: RetrievedChunk[]): string {
  return `${RAG_SYSTEM_INSTRUCTIONS}\n\nCONTEXT:\n${formatContext(retrieved)}`;
}
