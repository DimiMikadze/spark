<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Spark — project rules

Spark is enumeral's lead-qualification + booking assistant. Three explicit agents (Greeter, Qualifier, Booker) each have a small system prompt, share a tool-mocked backend, and hand off to each other via tool calls. A reusable RAG engine in `rag/` provides a `searchKnowledge` tool the agents can call when the user asks about enumeral.

## Stack (locked — do not swap without discussion)

- **App:** Next.js 16 + React 19 (App Router)
- **LLM + embeddings:** OpenAI via Vercel AI SDK 6 (`@ai-sdk/openai`). Chat: `gpt-5.4`. Embeddings: `text-embedding-3-large` truncated to **1536 dims** (Matryoshka), so they fit pgvector's HNSW limit.
- **Streaming:** `streamText` + `useChat` from the AI SDK. Plain text streaming, no `streamUI`.
- **Database:** Neon Postgres + pgvector. **Driver: `@neondatabase/serverless` only — no Drizzle, no Prisma, no other ORM.** Queries are written as `sql\`...\``tagged templates. Vector search uses pgvector's`<=>` operator.
- **Sessions:** UUID `httpOnly` cookie. No auth library, no NextAuth, no Clerk.
- **File parsers:** `unpdf` (PDF), `mammoth` (.docx), `fs.readFile` (.md / .txt). Pure JS, no native deps.
- **CLI runner:** `tsx`.

## Architecture

```
agents/                      multi-agent orchestrator — one folder per agent
  greeter/agent.ts           static greeting; flips state to qualifier; no LLM call
  qualifier/
    prompt.md                full system prompt as plain markdown
    agent.ts                 thin factory: load prompt, attach allowed tools
  booker/
    prompt.md
    agent.ts
  shared/
    style-rules.md           terse-tone rules, appended into every LLM prompt
    prompt.ts                loadPrompt() — reads .md, appends runtime footer
  orchestrator.ts            per-turn entry: pick agent, run streamText, apply handoff
  state.ts                   in-memory Map<conversationId, ConversationState>

tools/                       mocked side-effect surface — every tool is a stub
  knowledge.ts               searchKnowledge — wraps rag/retrieve as a tool
  lead.ts                    findLead, createLead, updateLead
  calendar.ts                checkAvailability, createEvent, updateEvent, deleteEvent
  email.ts                   sendSummaryEmail
  handoff.ts                 handoffToBooker — sets state.pendingHandoff
  index.ts                   createToolsForAgent(name, state) — per-agent permissions

rag/                         reusable RAG engine — pure functions, no Next.js imports
  parse.ts, chunk.ts, embed.ts, retrieve.ts
  db.ts                      Neon SQL client (connection only)
  queries.ts                 all DB query helpers — call sites import from here
  types.ts                   RAG-only types (Format, RetrievedChunk)

types.ts                     app-wide types (SparkAgentName, ConversationState, ...)

app/
  api/chat/route.ts          POST handler, streams via agents/orchestrator, CORS-enabled
  api/messages/route.ts      GET prior messages by session
  chat/page.tsx              internal admin/test view
  chat/chat-ui.tsx           shared chat client UI used by /chat and /embed
  chat/messages.ts           seeds the static greeting on the client
  embed/page.tsx             iframe chat page, renders chat/chat-ui.tsx (embed variant)
  page.tsx, layout.tsx

public/widget.js             embed script for third-party sites
scripts/                     ingest.ts, reset.ts, db-setup.ts
migrations/                  *.sql, applied in order by db-setup.ts
docs/                        gitignored — drop your source documents here
```

`rag/` must not import from Next.js, `agents/`, or top-level `types.ts` — keep it pure TypeScript so it can be lifted into another project later.

## Conventions

- **One agent per folder.** A new agent is `agents/<name>/{prompt.md, agent.ts}`. The prompt is plain markdown so it diffs cleanly and copies straight from `botpress-prompts/`. Don't inline prompts as TypeScript template strings.
- **Stable system prompts.** Prompts have a constant body and a tiny dynamic footer (date + conversation id) appended by `agents/shared/prompt.ts`. This is what makes OpenAI's automatic prompt cache hit on the prefix.
- **Bounded conversation history.** Every HTTP turn re-sends the full client-side history, so without bounds input cost grows quadratically over a conversation and the input eventually exceeds the model's context window. `agents/orchestrator.ts` applies two limits to `modelMessages` before every `streamText` call: a sliding window of the last ~20 user turns (`trimHistory`, cuts only at user-message boundaries to avoid orphaning tool-call/result pairs) and per-message compaction of tool-result payloads above ~2KB in prior turns (`compactToolResults`, replaces fat outputs with a stub). Both run inside the agent loop, so multi-agent handoffs and prior-turn history flow through the same pipeline. Current-turn tool results are never compacted — they're still in the in-flight reasoning chain.
- **RAG only via tool.** Agents reach the knowledge base through the `searchKnowledge` tool. Never paste retrieved chunks into the system prompt — it kills prompt caching and pays for retrieval the user didn't ask for.
- **Agent handoff is a tool call.** No regex over user text, no LLM router. The Qualifier emits `handoffToBooker(reason, email)`; the orchestrator applies it before the next turn.
- **Mocked tools are dumb.** Every tool's `execute` does `console.log(input)` and returns `{ ok: true, ...input }`. Wiring real services later is a one-file change per tool. Don't grow per-conversation state inside tools.
- **Provider abstraction.** Model and embedding provider are referenced in exactly two files (`agents/orchestrator.ts`, `rag/embed.ts`). Switching to Anthropic later is a one-line change in each. Don't sprinkle `openai(...)` calls elsewhere.
- **DB queries live in `rag/queries.ts`** as named, exported helper functions. Don't write inline `sql\`...\``at call sites — keep all SQL in one file so the schema is easy to grep and refactor. The migration runner in`scripts/db-setup.ts` is the one exception.
- **One `types.ts` per layer.** `types.ts` at the repo root holds Spark app types. `rag/types.ts` holds RAG-only types. `rag/` cannot import the root file.
- **No new dependencies without a clear reason.** Especially avoid: LangChain, LlamaIndex, Drizzle, Prisma, Pinecone client, Supabase client, NextAuth, iron-session.
- **Route handlers run on the Node runtime,** not Edge — pg-style drivers and parsers want Node.
- **CORS.** `/api/chat` must accept cross-origin POST + OPTIONS so the widget works from any host.
- **Don't store original uploaded files.** Ingest extracts text once, stores chunks. Originals stay in the user's `docs/` folder, gitignored.

## Scripts

- `pnpm ingest` — walks `docs/`, ingests new files (idempotent by content hash)
- `pnpm db:setup` — applies any new SQL files in `migrations/` (idempotent)
- `pnpm db:reset` — truncates `documents` and `chunks` (dev only)
- `pnpm db:wipe` — truncates `documents`, `chunks`, `chat_sessions`, `messages` (full blank-slate reset; keeps schema + `_migrations`)
- `pnpm dev` — Next.js dev server

## Future upgrades (not v1 — wire when needed, do not pre-build)

- **Reranker** — add Voyage Rerank 2.5 as a post-step in `rag/retrieve.ts` when retrieval misses become noticeable.
- **Hybrid search (BM25)** — add a `tsvector` column on `chunks.content` and merge with vector results via Reciprocal Rank Fusion when keyword queries fail.
- **Contextual retrieval** — prepend a 50-token chunk-context (Anthropic's pattern) during ingest. Requires an extra LLM call per chunk; use prompt caching.
- **Multi-tenant** — add a `tenants` table with public API keys, scope `documents` and `chat_sessions` by `tenant_id`, accept `data-key="..."` on the embed `<script>`. Single-tenant in v1.
- **Rate limiting** — Upstash Ratelimit on `/api/chat` keyed by IP/session, before the widget goes on a public site.
- **Drizzle (or any ORM)** — only revisit if SQL exceeds ~10 distinct query shapes. The current 4-table schema does not justify it.
- **LlamaParse** — swap in for `unpdf` if PDFs with complex tables/scans become important.

## Things to push back on

If a request would violate any of the above (e.g. "add Drizzle", "use Pinecone", "switch to Edge runtime"), pause and discuss before implementing. The locked stack is a deliberate choice to keep the project small and replaceable.
