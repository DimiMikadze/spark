<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Spark — project rules

Spark is a local-first RAG chatbot. The reusable RAG engine lives in `spark/`; the Next.js app under `app/` is the test harness and (eventually) the public-facing widget host.

The detailed build plan with phases, file-by-file tasks, and acceptance criteria is in `plan.md`. Read it before doing implementation work.

## Stack (locked — do not swap without discussion)

- **App:** Next.js 16 + React 19 (App Router)
- **LLM + embeddings:** OpenAI via Vercel AI SDK 6 (`@ai-sdk/openai`). Chat: `gpt-5.5`. Embeddings: `text-embedding-3-large` truncated to **1536 dims** (Matryoshka), so they fit pgvector's HNSW limit.
- **Streaming:** `streamText` + `useChat` from the AI SDK. Plain text streaming, no `streamUI`.
- **Database:** Neon Postgres + pgvector. **Driver: `@neondatabase/serverless` only — no Drizzle, no Prisma, no other ORM.** Queries are written as `sql\`...\`` tagged templates. Vector search uses pgvector's `<=>` operator.
- **Sessions:** UUID `httpOnly` cookie. No auth library, no NextAuth, no Clerk.
- **File parsers:** `unpdf` (PDF), `mammoth` (.docx), `fs.readFile` (.md / .txt). Pure JS, no native deps.
- **CLI runner:** `tsx`.

## Architecture

```
spark/                       reusable RAG engine — pure functions, no Next.js imports
  parse.ts, chunk.ts, embed.ts, retrieve.ts, chat.ts
  db.ts                      Neon SQL client (connection only)
  queries.ts                 all DB query helpers — call sites import from here
  prompts.ts                 system prompts and prompt builders
  types.ts                   shared types

app/
  api/chat/route.ts          POST handler, streams via spark/chat, CORS-enabled
  api/messages/route.ts      GET prior messages by session
  chat/page.tsx              internal admin/test view
  embed/page.tsx             chat UI rendered inside the widget iframe
  page.tsx, layout.tsx

public/widget.js             embed script for third-party sites
scripts/                     ingest.ts, reset.ts, db-setup.ts
migrations/                  *.sql, applied in order by db-setup.ts
docs/                        gitignored — drop your source documents here
```

`spark/` must not import from Next.js (`next/*`, `react`, etc.). It runs from CLI scripts and from route handlers — keep it pure TypeScript so it can be lifted into another project later.

## Conventions

- **Provider abstraction.** Model and embedding provider are referenced in exactly two files (`spark/chat.ts`, `spark/embed.ts`). Switching to Anthropic later is a one-line change in each. Don't sprinkle `openai(...)` calls elsewhere.
- **DB queries live in `spark/queries.ts`** as named, exported helper functions. Don't write inline `sql\`...\`` at call sites — keep all SQL in one file so the schema is easy to grep and refactor. The migration runner in `scripts/db-setup.ts` is the one exception.
- **Prompts live in `spark/prompts.ts`.** Don't inline system prompts in route handlers or `chat.ts`.
- **No new dependencies without a clear reason.** Especially avoid: LangChain, LlamaIndex, Drizzle, Prisma, Pinecone client, Supabase client, NextAuth, iron-session.
- **Route handlers run on the Node runtime,** not Edge — pg-style drivers and parsers want Node.
- **CORS.** `/api/chat` must accept cross-origin POST + OPTIONS so the widget works from any host.
- **Don't store original uploaded files.** Ingest extracts text once, stores chunks. Originals stay in the user's `docs/` folder, gitignored.

## Scripts

- `pnpm ingest` — walks `docs/`, ingests new files (idempotent by content hash)
- `pnpm db:setup` — applies any new SQL files in `migrations/` (idempotent)
- `pnpm db:reset` — truncates `documents` and `chunks` (dev only)
- `pnpm dev` — Next.js dev server

## Future upgrades (not v1 — wire when needed, do not pre-build)

- **Reranker** — add Voyage Rerank 2.5 as a post-step in `spark/retrieve.ts` when retrieval misses become noticeable.
- **Hybrid search (BM25)** — add a `tsvector` column on `chunks.content` and merge with vector results via Reciprocal Rank Fusion when keyword queries fail.
- **Contextual retrieval** — prepend a 50-token chunk-context (Anthropic's pattern) during ingest. Requires an extra LLM call per chunk; use prompt caching.
- **Multi-tenant** — add a `tenants` table with public API keys, scope `documents` and `chat_sessions` by `tenant_id`, accept `data-key="..."` on the embed `<script>`. Single-tenant in v1.
- **Rate limiting** — Upstash Ratelimit on `/api/chat` keyed by IP/session, before the widget goes on a public site.
- **Drizzle (or any ORM)** — only revisit if SQL exceeds ~10 distinct query shapes. The current 4-table schema does not justify it.
- **LlamaParse** — swap in for `unpdf` if PDFs with complex tables/scans become important.

## Things to push back on

If a request would violate any of the above (e.g. "add Drizzle", "use Pinecone", "switch to Edge runtime"), pause and discuss before implementing. The locked stack is a deliberate choice to keep the project small and replaceable.
