import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { retrieve } from './retrieve';
import { buildRagSystem } from './prompts';

function extractText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

export async function chat(messages: UIMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const query = lastUser ? extractText(lastUser) : '';

  const retrieved = query ? await retrieve(query, 5) : [];
  const system = buildRagSystem(retrieved);

  const result = streamText({
    model: openai('gpt-5.5'),
    system,
    messages: await convertToModelMessages(messages),
  });

  return { result, retrieved };
}
