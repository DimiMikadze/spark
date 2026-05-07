import { sql } from '../lib/db';
import type { Format, RetrievedChunk } from './types';

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

export async function isDocumentIngested(contentHash: string): Promise<boolean> {
  const rows = (await sql`
    SELECT id FROM documents WHERE content_hash = ${contentHash}
  `) as { id: string }[];
  return rows.length > 0;
}

export type ChunkInput = {
  content: string;
  tokenCount: number;
  index: number;
};

export async function insertDocumentWithChunks(args: {
  documentId: string;
  sourcePath: string;
  contentHash: string;
  format: Format;
  chunks: ChunkInput[];
  embeddings: number[][];
}): Promise<void> {
  const { documentId, sourcePath, contentHash, format, chunks, embeddings } = args;

  await sql.transaction([
    sql`
      INSERT INTO documents (id, source_path, content_hash, format)
      VALUES (${documentId}, ${sourcePath}, ${contentHash}, ${format})
    `,
    ...chunks.map(
      (c, i) => sql`
        INSERT INTO chunks (document_id, content, token_count, chunk_index, embedding)
        VALUES (
          ${documentId},
          ${c.content},
          ${c.tokenCount},
          ${c.index},
          ${vectorLiteral(embeddings[i])}::vector
        )
      `,
    ),
  ]);
}

export async function truncateDocumentsAndChunks(): Promise<void> {
  await sql`TRUNCATE documents, chunks RESTART IDENTITY CASCADE`;
}

export async function searchChunks(
  queryEmbedding: number[],
  k: number,
): Promise<RetrievedChunk[]> {
  const literal = vectorLiteral(queryEmbedding);
  return (await sql`
    SELECT
      c.content,
      d.source_path AS source,
      1 - (c.embedding <=> ${literal}::vector) AS score
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${k}
  `) as RetrievedChunk[];
}
