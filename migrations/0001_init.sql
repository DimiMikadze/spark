-- pgvector ships the `vector` data type and the cosine/L2/IP distance operators
-- (<=>, <->, <#>). pgcrypto ships gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_path   text NOT NULL,
  -- SHA-256 over the raw file bytes. Used by the ingest script to skip
  -- already-ingested files and to deduplicate identical content from
  -- different paths.
  content_hash  text NOT NULL UNIQUE,
  format        text NOT NULL,
  ingested_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE CASCADE so dropping a document automatically removes its chunks.
  document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content       text NOT NULL,
  token_count   int NOT NULL,
  chunk_index   int NOT NULL,
  -- 1536 dims is OpenAI text-embedding-3-large truncated via the Matryoshka
  -- `dimensions` parameter. pgvector's HNSW index supports up to 2000 dims;
  -- the native 3072-dim variant would force a slower IVFFlat index.
  embedding     vector(1536) NOT NULL
);

-- HNSW: a graph-based approximate-nearest-neighbour index. Faster queries
-- than IVFFlat at the cost of slower inserts and more memory. For our
-- write-once / read-many ingest pattern this is the right trade-off.
-- vector_cosine_ops pairs with the <=> operator we use in queries.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks(document_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        text NOT NULL,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Composite index on (session_id, created_at) so loading a chat history is
-- a single ordered index scan instead of a sort.
CREATE INDEX IF NOT EXISTS messages_session_idx ON messages(session_id, created_at);
