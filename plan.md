# Spark — RAG Chatbot Build Plan

A local-first RAG chatbot built on Next.js 16 + OpenAI + Neon Postgres (pgvector). Reusable RAG engine lives in `rag/`; `app/` is the test harness.

## Goals

- Build fast, ship a working chat UI with retrieval grounding
- $0 running cost (free tiers + existing OpenAI credits)
- Keep RAG engine isolated in `rag/` so it can be reused in other apps
- Deployable so the chat can be embedded as a widget on any third-party website
- **Future direction (not v1):** multi-tenant — different customer sites, each with their own document corpus, identified by an API key on the embed script

## Stack (locked)

| Concern          | Choice                                                    | Why                                                            |
| ---------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| App framework    | Next.js 16.2.4 + React 19                                 | Already installed                                              |
| LLM              | OpenAI GPT-5.5                                            | User has credits                                               |
| Embeddings       | OpenAI `text-embedding-3-large` @ 1536 dims               | Matryoshka-truncated; works with pgvector HNSW (max 2000 dims) |
| AI library       | Vercel AI SDK 6 (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`) | Free, MIT, provider-agnostic, `streamText` + `useChat`         |
| Database         | Neon Postgres + pgvector                                  | Free tier, single connection string for app + vectors          |
| DB driver        | `@neondatabase/serverless` (raw SQL via tagged templates) | No ORM — vector ops need raw SQL anyway; fewer deps            |
| File parsers     | `unpdf` (PDF), `mammoth` (docx), `fs` (md/txt)            | Pure JS, no native deps                                        |
| CLI runner       | `tsx`                                                     | Run `scripts/ingest.ts` directly                               |
| Sessions         | UUID `httpOnly` cookie                                    | No auth library                                                |

**Explicitly not using:** LangChain, LlamaIndex, Supabase, Pinecone, Drizzle, reranker, auth library.

Reranker / Voyage embeddings / contextual retrieval / Drizzle (if queries grow) are documented as **future upgrades** in `AGENTS.md` so they can be added without rework.

## Folder layout

```
rag/                         reusable RAG engine
  parse.ts                   parseFile(path) → string, dispatches by extension
  chunk.ts                   tokenizer-aware chunker (~500 tok, 50 overlap)
  embed.ts                   wraps OpenAI embeddings via AI SDK
  retrieve.ts                top-k cosine search via pgvector
  chat.ts                    streamText wrapper that injects retrieved context
  db.ts                      Neon SQL client (sql tagged template)
  types.ts                   shared types

app/
  api/chat/route.ts          POST handler, streams via rag/chat.ts (CORS-enabled)
  api/messages/route.ts      GET prior messages for current session
  chat/page.tsx              useChat() UI — internal admin/test view
  embed/page.tsx             stripped chat UI rendered inside the widget iframe
  layout.tsx                 (existing)
  page.tsx                   landing → link to /chat

public/
  widget.js                  the embed script customers add to their site

scripts/
  ingest.ts                  walks docs/, parses, chunks, embeds, inserts
  reset.ts                   truncates documents/chunks (dev convenience)
  db-setup.ts                runs migrations/*.sql idempotently

migrations/
  0001_init.sql              CREATE EXTENSION vector + tables + HNSW index

docs/                        drop your files here (.md, .pdf, .txt, .docx) — gitignored
plan.md                      this file
AGENTS.md                    durable agent rules (Claude + Cursor)
CLAUDE.md                    one-liner: @AGENTS.md
.env.local                   OPENAI_API_KEY, DATABASE_URL
```

## Database schema

Defined as plain SQL in `migrations/0001_init.sql` — not Drizzle.

```sql
-- migrations/0001_init.sql
CREATE EXTENSION IF NOT EXISTS vector;

documents
  id              uuid PK
  source_path     text       // e.g. docs/handbook.pdf
  content_hash    text UNIQUE
  format          text       // 'pdf' | 'md' | 'txt' | 'docx'
  ingested_at     timestamptz default now()

chunks
  id              uuid PK
  document_id     uuid FK → documents
  content         text
  token_count     int
  chunk_index     int
  embedding       vector(1536)
  // HNSW index on embedding using vector_cosine_ops

chat_sessions
  id              uuid PK
  created_at      timestamptz default now()

messages
  id              uuid PK
  session_id      uuid FK → chat_sessions
  role            text    // 'user' | 'assistant'
  content         text
  created_at      timestamptz default now()
```

(The schema above is the conceptual shape; the actual SQL in `migrations/0001_init.sql` includes column types, FK constraints, and the HNSW index.)

## Phases

### Phase 1 — Setup (~10 min)

- [x] Sign up for Neon free tier; create project; copy `DATABASE_URL`
- [ ] Add `DATABASE_URL` to `.env.local` (`OPENAI_API_KEY` already present)
- [ ] Install deps: `pnpm add ai @ai-sdk/react @ai-sdk/openai @neondatabase/serverless unpdf mammoth zod`
- [ ] Install dev deps: `pnpm add -D tsx @types/node`
- [ ] Add scripts to `package.json`: `ingest`, `db:setup`, `db:reset`
- [ ] Create empty folders: `rag/`, `scripts/`, `docs/`, `migrations/`
- [ ] Add `docs/` to `.gitignore`

### Phase 2 — Database (~15 min)

- [ ] `migrations/0001_init.sql` — `CREATE EXTENSION vector;` + 4 tables + HNSW index on `chunks.embedding`
- [ ] `rag/db.ts` — exports `sql` from `neon(process.env.DATABASE_URL!)` for tagged-template queries
- [ ] `scripts/db-setup.ts` — reads each `migrations/*.sql` file in order and executes; tracks applied files in a `_migrations` table so it's idempotent
- [ ] Run: `pnpm db:setup`

### Phase 3 — Spark library (~45 min)

- [ ] `rag/parse.ts` — extension dispatch: `.md`/`.txt` → fs, `.pdf` → unpdf, `.docx` → mammoth
- [ ] `rag/chunk.ts` — split by paragraph then merge to ~500 tokens with 50 overlap. Use a simple tokenizer (`tiktoken` or just word-count approximation; keep it simple)
- [ ] `rag/embed.ts` — `embedMany({ model: openai.embedding('text-embedding-3-large', { dimensions: 1536 }), values })`
- [ ] `rag/retrieve.ts` — `retrieve(query: string, k = 5) → { content, source }[]` using cosine distance ordered ASC
- [ ] `rag/chat.ts` — accepts `messages`, retrieves on the latest user message, returns `streamText({ model: openai('gpt-5.5'), system: <RAG prompt>, messages })`. The system prompt instructs the model to ground answers in provided context and say "I don't know" if context is insufficient

### Phase 4 — Ingest CLI (~15 min)

- [ ] `scripts/ingest.ts` — walk `docs/` recursively, hash each file, skip if `content_hash` already in `documents`, else parse → chunk → embed (batch up to 100) → insert document + chunks in a transaction
- [ ] Print progress per file
- [ ] `scripts/reset.ts` — `TRUNCATE documents, chunks CASCADE` for dev resets

### Phase 5 — Chat API + UI (~30 min)

- [ ] `app/api/chat/route.ts` — read or create `session_id` cookie, call `rag/chat.ts`, return `result.toUIMessageStreamResponse()`. On `onFinish`, persist user + assistant messages to `messages` table. Add CORS headers (`Access-Control-Allow-Origin: *`, plus OPTIONS handler) so the widget can call it cross-origin
- [ ] `app/api/messages/route.ts` — `GET` returns prior messages for current session
- [ ] `app/chat/page.tsx` — server component fetches prior messages, hydrates `useChat({ initialMessages })`. Tailwind for minimal styling; show retrieved-source citations under each assistant message
- [ ] `app/page.tsx` — replace template with link to `/chat`

### Phase 6 — Verification

- [ ] Drop 2-3 sample files in `docs/` (mix of .md, .pdf)
- [ ] `pnpm ingest` — verify chunks land in DB
- [ ] `pnpm dev`, open `/chat`, ask a question grounded in the sample docs
- [ ] Verify it streams, cites sources, and "I don't know" works for off-topic questions
- [ ] Reload the page — verify history persists

### Phase 7 — Widget + Deploy (~30 min)

- [ ] `app/embed/page.tsx` — minimal chat UI sized for the iframe (no nav/footer); reuses `useChat`
- [ ] `public/widget.js` — vanilla JS (~50 lines): creates a launcher button (bottom-right), on click injects an iframe pointing at `/embed`, handles open/close, listens for `postMessage` from the iframe for height/close events
- [ ] CORS already added in Phase 5; confirm OPTIONS preflight works
- [ ] Test locally: create a `test-host.html` outside the project that loads `<script src="http://localhost:3000/widget.js"></script>` — verify it works from a different origin
- [ ] Deploy to Vercel (free tier): `vercel deploy`. Set `OPENAI_API_KEY` and `DATABASE_URL` in Vercel project env vars
- [ ] Verify the deployed widget loads on a real third-party page (e.g. paste the script tag into a static HTML file and open it locally)

## Open trade-offs (documented for later)

- **Reranker not added.** When retrieval misses are noticeable, add Voyage Rerank 2.5 as a post-step in `rag/retrieve.ts`. Single HTTP call.
- **Hybrid search (BM25) not added.** When semantic-only misses keyword queries, add a `tsvector` column and RRF merge.
- **Contextual Retrieval not added.** When chunks lose meaning out of context, add a 50-token contextual prefix per chunk during ingest (Anthropic's pattern).
- **Edge runtime not used.** Route handlers run on Node because pg drivers and parsers want Node. Fine for free-tier Vercel.
- **Streaming UI components (`streamUI`) not used.** Plain text streaming is enough for v1.
- **Multi-tenant not built.** v1 is single-tenant — one project, one document corpus, one OpenAI key. To go multi-tenant later: add a `tenants` table with public API keys, scope `documents` and `chat_sessions` by `tenant_id`, accept `data-key="…"` on `<script src="widget.js">` and pass it through to `/api/chat`. No data migration needed beyond adding the column.
- **Rate limiting not added.** Once the widget is on a public site, add Upstash Ratelimit (free tier) on `/api/chat` keyed by IP or session.
- **Widget customization not added.** Color, position, initial message — pass via `data-*` attributes when needed.
- **Drizzle (or any ORM) not added.** If queries grow beyond ~10 distinct shapes or non-vector relations get complex, revisit Drizzle. For v1 the raw SQL stays under ~100 lines.

## Cost expectations

| Item                                   | Monthly                              |
| -------------------------------------- | ------------------------------------ |
| Neon free tier                         | $0                                   |
| Vercel AI SDK                          | $0                                   |
| OpenAI embeddings (a few hundred docs) | < $1 from credits                    |
| OpenAI GPT-5.5 chat                    | depends on usage; covered by credits |
| **Total cash cost**                    | **$0**                               |

## Acceptance criteria

1. `pnpm ingest` ingests `.md`, `.pdf`, `.txt`, `.docx` files from `docs/` without error
2. Re-running `pnpm ingest` is idempotent (skips files by content hash)
3. `/chat` streams answers grounded in ingested content, cites source filenames
4. Conversations persist across reloads via session cookie
5. Switching to Anthropic later requires changes in only `rag/chat.ts` and `rag/embed.ts`
6. The deployed app exposes a `widget.js` that, when added as a `<script>` to any third-party HTML page, renders a working chat launcher
7. `AGENTS.md` documents the architecture so a fresh agent (Claude or Cursor) can pick up later phases without re-reading this plan
