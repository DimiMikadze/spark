import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

const model = openai.embedding('text-embedding-3-large');
const providerOptions = { openai: { dimensions: 1536 } };

export const EMBEDDING_DIMS = 1536;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model, values: texts, providerOptions });
  return embeddings;
}

export async function embedQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({ model, value: query, providerOptions });
  return embedding;
}
