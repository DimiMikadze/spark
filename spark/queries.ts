import { sql } from './db';
import type { Format, RetrievedChunk } from './types';

// pgvector accepts vectors as a string literal like '[0.1,0.2,...]' cast to ::vector.
// We convert from a JS number[] right at the boundary so callers don't have to
// think about wire format.
function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

// --- documents ---

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

// Inserts the document row and all its chunks atomically. We generate the
// document UUID client-side so every INSERT can reference it inside one
// transaction — without a client-side id we'd have to do `INSERT ... RETURNING`
// then a second round-trip for the chunks, and the two wouldn't be atomic
// over the Neon HTTP driver.
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
  // CASCADE drops chunks (FK references documents). RESTART IDENTITY is a
  // no-op for our UUID PKs but kept for safety if we ever add a serial column.
  await sql`TRUNCATE documents, chunks RESTART IDENTITY CASCADE`;
}

// --- retrieval ---

// `<=>` is pgvector's cosine-distance operator: lower = more similar.
// We ORDER BY it ASC and SELECT (1 - distance) so callers get a familiar
// 0..1 similarity score where higher = better.
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

// --- chat sessions & messages ---

export async function createChatSession(sessionId: string): Promise<void> {
  await sql`INSERT INTO chat_sessions (id) VALUES (${sessionId})`;
}

export type MessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export async function getMessagesBySession(sessionId: string): Promise<MessageRow[]> {
  return (await sql`
    SELECT id, role, content
    FROM messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC
  `) as MessageRow[];
}

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  await sql`
    INSERT INTO messages (session_id, role, content)
    VALUES (${sessionId}, ${role}, ${content})
  `;
}
