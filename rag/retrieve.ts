import { embedQuery } from './embed';
import { searchChunks } from './queries';
import type { RetrievedChunk } from './types';

export async function retrieve(query: string, k = 5): Promise<RetrievedChunk[]> {
  const embedding = await embedQuery(query);
  return searchChunks(embedding, k);
}
