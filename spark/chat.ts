import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { retrieve } from './retrieve';
import { buildRagSystem } from './prompts';

// Pulls the plain text out of a UIMessage. AI SDK 6 messages are arrays of
// "parts" (text, tool calls, files, …); we only care about text parts here.
function extractText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

// We only retrieve once per chat turn, against the **latest** user message —
// not the whole conversation. This keeps the retrieval focused and avoids
// re-embedding the conversation history on every turn. Multi-turn questions
// like "and what about deployment?" lose context this way; for v1 that's an
// acceptable trade-off vs. the complexity of conversational query rewriting.
export async function chat(messages: UIMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const query = lastUser ? extractText(lastUser) : '';

  const retrieved = query ? await retrieve(query, 5) : [];
  const system = buildRagSystem(retrieved);

  // `convertToModelMessages` is async because it may need to download remote
  // file parts. Without `await` it would be a Promise leaked into streamText.
  const result = streamText({
    model: openai('gpt-5.5'),
    system,
    messages: await convertToModelMessages(messages),
  });

  return { result, retrieved };
}
