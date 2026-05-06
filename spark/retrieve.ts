import { embedQuery } from './embed';
import { searchChunks } from './queries';
import type { RetrievedChunk } from './types';

// Two-step retrieval: embed the user's question with the same model used at
// ingest time (otherwise the vector spaces don't line up), then ask Postgres
// to return the nearest chunks by cosine distance. The actual SQL lives in
// `queries.ts`; this function is the orchestrator.
export async function retrieve(query: string, k = 5): Promise<RetrievedChunk[]> {
  const embedding = await embedQuery(query);
  return searchChunks(embedding, k);
}
