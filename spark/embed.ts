import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

// `text-embedding-3-large` is natively 3072-dim, but pgvector's HNSW index
// only supports vectors up to 2000 dims. We use OpenAI's Matryoshka-style
// `dimensions` parameter to truncate to 1536 — the model is trained so that
// any prefix is a valid embedding. Quality drop vs full 3072 is small (~1%).
const model = openai.embedding('text-embedding-3-large');
const providerOptions = { openai: { dimensions: 1536 } };

export const EMBEDDING_DIMS = 1536;

// `embedMany` batches multiple values into a single OpenAI request. Use this
// for ingestion (potentially hundreds of chunks at once).
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model, values: texts, providerOptions });
  return embeddings;
}

// `embed` is the single-value variant — used at query time, where we have
// exactly one user question to embed.
export async function embedQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({ model, value: query, providerOptions });
  return embedding;
}
