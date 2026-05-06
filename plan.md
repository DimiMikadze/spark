# Spark — implementation plan

This rewrite replaces the current `agents/` + `prompts/` + `tools/` code with a smaller, more honest version that mirrors the Botpress flow in `botpress-prompts/`. Mocks become trivial (`console.log` + return success). Agent routing becomes tool-based. The system prompt for each agent stays small and stable so OpenAI prompt caching does most of the cost work.

Read `botpress-prompts/CLAUDE.md` and the per-node files alongside this plan.

## Goals

- Three explicit agents, each with its own short prompt, mirroring Botpress nodes:
  - **Greeter** — static message only, no LLM call. Hands off to Qualifier.
  - **Qualifier** — short conversation, qualifies the lead, hands off to Booker.
  - **Booker** — handles new booking, reschedule, cancel.
- All agents (except Greeter, which doesn't reason) can search the knowledge base via a `searchKnowledge` tool.
- Tools are dumb mocks: `console.log` the call, return `{ ok: true, ...echoOfInput }`.
- Agent handoffs are explicit tool calls (`handoffToBooker`), not regex over user text.
- One single `types.ts` file at the repo root for app-wide types. `rag/types.ts` keeps RAG-only types so `rag/` stays portable.
- Code is documented with comments that explain *why*, never numbered step recipes.

## Reliability and cost strategy

- **Stable system prompts.** Identity, rules, tool descriptions are constant across turns. Date and conversation id sit at the end. This lets OpenAI's automatic prompt cache hit on every turn after the first.
- **RAG as a tool, not a system-prompt blob.** `searchKnowledge(query)` only fires when the user asks an enumeral question. No retrieval cost on chit-chat, no prompt mutation per turn.
- **Per-agent prompts under ~500 tokens.** Smaller prompts hallucinate less. This is the whole reason the Botpress flow has multiple nodes.
- **No state JSON in prompts.** The conversation history already encodes it. The orchestrator passes nothing extra except current date.
- **Greeter is free.** Pure static-text emission; never calls the model.
- **Tight output budget already in place** (`maxOutputTokens: 600`, `reasoningEffort: none`, `textVerbosity: low`). Keep.

## Target folder structure

```
agents/
  greeter/
    agent.ts                static-message agent, no LLM call
  qualifier/
    prompt.md               full system prompt as plain markdown (1:1 with Botpress)
    agent.ts                builds runtime: prompt + allowed tools
  booker/
    prompt.md
    agent.ts
  shared/
    style-rules.md          terse-tone rules included in every LLM prompt
    prompt.ts               loadPrompt() helper — reads .md at module init, appends date
  orchestrator.ts           per-turn entry: pick agent, run, detect handoff, return stream
  state.ts                  in-memory Map<conversationId, ConversationState>
tools/
  index.ts                  createToolsForAgent(name) — tool permissions per agent
  knowledge.ts              searchKnowledge — wraps rag/retrieve
  lead.ts                   findLead, createLead, updateLead — mocked
  calendar.ts               checkAvailability, createEvent, updateEvent, deleteEvent — mocked
  email.ts                  sendSummaryEmail — mocked
  handoff.ts                handoffToBooker — sets state.activeAgent on next turn
rag/
  parse.ts, chunk.ts, embed.ts, retrieve.ts, queries.ts, db.ts, types.ts
  (rag/chat.ts is removed — orchestration moves to agents/orchestrator.ts)
types.ts                    Spark app types (SparkAgentName, ConversationState, etc.)
app/...                     unchanged except route imports
```

## What gets deleted

- `agents/agent-state.ts` — regex booking-intent detector, in-memory mock leads, transition helpers. All replaced by `agents/state.ts` + tool-based handoff.
- `agents/router.ts`, `agents/qualifier.ts`, `agents/booker.ts`, `agents/index.ts`, `agents/types.ts` — replaced by per-agent folders + orchestrator.
- `prompts/` (entire folder, including dead `context.ts`) — content moves into `agents/<name>/prompt.md` and `agents/shared/`.
- `tools/types.ts`, current `tools/lead.ts`, `tools/calendar.ts`, `tools/email.ts` — replaced by simpler mocked versions plus new `handoff.ts` and `knowledge.ts`.
- `rag/chat.ts` — moves to `agents/orchestrator.ts`. RAG no longer imports from `agents/`.

## Phases

Each phase is independently mergeable. Run the dev server and exercise the flow at the end of every phase.

### Phase 0 — wipe legacy code

- Delete the files under "What gets deleted" above.
- Move `rag/chat.ts` to `agents/orchestrator.ts` (rename + content rewrite happens in Phase 7).

### Phase 1 — types and shared helpers

- `types.ts` (top-level): `SparkAgentName = 'greeter' | 'qualifier' | 'booker'`, `BookingIntent`, `ConversationState`, `SparkAgentRuntime` (`{ name, system, tools? }`), `HandoffSignal`.
- `agents/shared/style-rules.md`: terse tone rules from `prompts/shared.ts` `SHARED_STYLE_RULES`, no code.
- `agents/shared/prompt.ts`: `loadPrompt(name, args)` — reads `agents/<name>/prompt.md` at module init, appends a small footer with `currentDate` and `conversationId`. Style rules are inlined into the prompt files (so the cacheable prefix is whole).
- Acceptance: `pnpm tsc --noEmit` passes with the new files in place but unused.

### Phase 2 — mock tools

Every mock follows the same pattern:

```ts
execute: async (input) => {
  console.log('[tool:findLead]', input);
  return { ok: true, ...input };
}
```

- `tools/lead.ts`: `findLead({ email })`, `createLead({ email, businessDescription, aiNeed })`, `updateLead({ email, ...patch })`.
- `tools/calendar.ts`: `checkAvailability({ requestedTime, city, timezone, durationMinutes })`, `createEvent(...)`, `updateEvent({ calendarEventId, ... })`, `deleteEvent({ calendarEventId })`. Return a deterministic fake `calendarEventId` derived from email so reschedule/cancel can echo it back. No in-memory map.
- `tools/email.ts`: `sendSummaryEmail({ eventType, subject, body, to })`.
- `tools/knowledge.ts`: `searchKnowledge({ query })` — calls `rag/retrieve.retrieve(query, 3)` and returns the chunks. This is the only RAG entry point used by agents.
- `tools/handoff.ts`: `handoffToBooker({ reason: 'new_booking' | 'reschedule' | 'cancel', email })` — calls `recordHandoff(state, 'booker', reason)` from `agents/state.ts`. Returns `{ ok: true }`.
- `tools/index.ts`: `createToolsForAgent(name, { conversationId, state })` returns the per-agent tool set:
  - `qualifier`: `searchKnowledge`, `findLead`, `createLead`, `updateLead`, `handoffToBooker`.
  - `booker`: `searchKnowledge`, `findLead`, `updateLead`, `checkAvailability`, `createEvent`, `updateEvent`, `deleteEvent`, `sendSummaryEmail`.
  - `greeter`: no tools (Greeter never reaches the LLM).

Comment each tool factory with one line: *why* the tool exists, what surface it mocks. No step-by-step recipes inside `execute`.

Acceptance: tools compile, `tools/index.ts` produces a valid `ToolSet` for each agent.

### Phase 3 — state

- `agents/state.ts`: `Map<conversationId, ConversationState>` with `getOrCreate`, `recordHandoff(state, target, reason)`, `snapshot(conversationId)`. No regex, no email extraction, no auto-transitions, no mock-lead store.
- `ConversationState`: `{ conversationId, activeAgent: SparkAgentName, pendingHandoff?: { target, reason } }`. Default `activeAgent` is `'greeter'` for a brand-new conversation.

Acceptance: a simple unit-style sanity check via `tsx` script that creates a state, records a handoff, and reads it back.

### Phase 4 — Greeter agent

- `agents/greeter/agent.ts` exports:
  - `SPARK_GREETING` (single source of truth, replaces `prompts/shared.ts` export).
  - `runGreeter(state)` — marks state as greeted, sets `activeAgent = 'qualifier'`, returns the static greeting string.
- The Next.js client already injects `SPARK_GREETING` as the initial assistant message via `app/chat/messages.ts`. Keep that — the user sees the greeting on first load with zero round-trip. The server-side greeter just exists to record "we have greeted" and switch the active agent so the next user message routes to Qualifier. No LLM call ever runs as Greeter.

Acceptance: a fresh conversation starts in `'greeter'`, the orchestrator's first call transitions to `'qualifier'` without invoking OpenAI.

### Phase 5 — Qualifier agent

- `agents/qualifier/prompt.md`: lifted almost verbatim from `botpress-prompts/qualifier-node-instructions.md`. Cuts:
  - Botpress-specific syntax (`{{workflow.currentDate}}`) becomes a dynamic footer appended by `loadPrompt`.
  - The "Database operations" section becomes "Tools" naming our mocks: `findLead`, `createLead`, `updateLead`.
  - Add a "Handoff" section: after a qualified lead is saved, **call `handoffToBooker`** with the email and `reason: 'new_booking'`. For reschedule/cancel, call it with `reason: 'reschedule' | 'cancel'`.
  - Add a "Knowledge" section: when the user asks an enumeral question, **call `searchKnowledge` first**, then answer briefly from the result.
  - Append the contents of `agents/shared/style-rules.md` directly (so the prefix is monolithic and cacheable).
- `agents/qualifier/agent.ts`: thin factory — loads the prompt, attaches qualifier's tool set.

Acceptance: in `/chat`, the LLM consistently calls `findLead` → `createLead`/`updateLead` → `handoffToBooker` for a qualified lead, and `handoffToBooker(reason: 'reschedule')` (no lead writes) when the user opens with "I want to reschedule". Tool calls log to the server console.

### Phase 6 — Booker agent

- `agents/booker/prompt.md`: lifted from `botpress-prompts/booker-node-instructions.md`. Cuts:
  - Tool names rewritten to ours.
  - Add the "Knowledge" section pointing at `searchKnowledge`.
  - Append `agents/shared/style-rules.md`.
- `agents/booker/agent.ts`: thin factory — loads the prompt, attaches booker's tool set.

Acceptance: after a Qualifier handoff, the next user turn runs Booker. For a new booking the LLM consistently calls `checkAvailability` → `createEvent` → `updateLead` (calendarEventId) → `sendSummaryEmail`. For reschedule: `findLead` → `checkAvailability` → `updateEvent` → `sendSummaryEmail`. For cancel: `findLead` → `deleteEvent` → `updateLead` (clear calendarEventId) → `sendSummaryEmail`. All tool calls visible in the existing debug panel.

### Phase 7 — Orchestrator

- `agents/orchestrator.ts` exports `chat({ messages, conversationId, currentDate })`:
  1. Get-or-create state.
  2. If `state.activeAgent === 'greeter'` on the first user message: run `runGreeter(state)` (transitions state to `'qualifier'`) and fall through to step 3 — the same user message is now handled by Qualifier. (Greeter does not produce an LLM message; it's a no-op transition because the client already shows the greeting.)
  3. Build the active agent's runtime: load prompt, get tool set.
  4. Call `streamText` with `tools`, `stopWhen: stepCountIs(8)`, current `maxOutputTokens` and provider options.
  5. Return `{ result, agentName, state }`. The route handler is responsible for `toUIMessageStreamResponse` and metadata. **Crucially,** orchestrator does not pass retrieved chunks into the prompt — RAG only reaches the model through `searchKnowledge` tool calls.
- The `handoffToBooker` tool's `execute` already sets `state.activeAgent = 'booker'`. The next user turn naturally runs Booker. No mid-turn agent swap.

Acceptance: a full transcript (greeting → qualifying → handoff → booking) runs end-to-end with each agent calling only its allowed tools. Server console shows the trace.

### Phase 8 — wire route handler

- `app/api/chat/route.ts`: import `chat` from `agents/orchestrator` (was `rag/chat`). Update metadata builder to include `agentName` and the new `state` snapshot. The CORS, cookie, and currentDate logic stays.
- `app/api/messages/route.ts`: unchanged — still returns the seeded greeting via `buildInitialMessages`.
- `app/chat/messages.ts`: import `SPARK_GREETING` from `agents/greeter/agent` instead of `prompts`.
- `app/chat/chat-ui.tsx`: unchanged. Existing debug panels keep working since metadata still includes `agent` and `state`.

Acceptance: `pnpm dev`, visit `/chat`, exercise the three flows manually. The widget at `/embed` works the same.

### Phase 9 — refresh AGENTS.md

Update sections to reflect:

- New folder layout (replace the old block).
- Conventions: prompts live as `.md` files inside `agents/<name>/`, loaded by `agents/shared/prompt.ts`. Style rules are appended into each prompt file at module init so the cached prefix is whole.
- Knowledge base is reached only through the `searchKnowledge` tool, never by stuffing chunks into the system prompt.
- Mocked tools live in `tools/`. They `console.log` and return `{ ok: true, ...input }`. Wiring real services later is a one-file change per tool.
- Agent handoff is via tools (`handoffToBooker`). No regex over user text.
- Single `types.ts` at the repo root for app types; `rag/types.ts` stays for RAG-only types so `rag/` remains portable.
- Model: `gpt-5.4-mini` (was incorrectly `gpt-5.5`).

## Acceptance criteria for the rewrite as a whole

- The three Botpress flows (qualify a real business, reject a non-business, reschedule by email) all work in `/chat`.
- Server console shows tool-call traces for every flow.
- No regex parses user text. No in-memory mock-lead map. No state JSON in any prompt.
- Each agent prompt file is < 500 tokens (excluding shared style rules block).
- Switching one tool from mock to real means editing exactly one file under `tools/` and nothing else.
- `pnpm tsc --noEmit` and `pnpm lint` pass.

## Out of scope (do not pre-build)

- Persisting chat history to Postgres. (Schema is there, code path isn't wired. Add when the UX needs it.)
- Conversation summarization (Botpress's Summary Agent). Add when transcripts start hitting prompt limits.
- Real Google Calendar / email / lead DB integrations.
- Multi-tenant scoping.
- Returning-user memory (`hasBeenGreeted` across sessions).
