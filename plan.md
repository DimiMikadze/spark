# Plan: bound long-conversation cost & failure

Two changes in `agents/orchestrator.ts`. Both target the same root cause: every turn re-sends the full message history to the model, so cost grows quadratically over a conversation and eventually exceeds gpt-5.4's context window (which surfaces as a generic `'An error occurred.'` and a dead conversation).

## 1. Trim history before `streamText`

**Where:** `agents/orchestrator.ts` — between `convertToModelMessages(messages)` (line 76) and the `streamText` call (line 85), and again inside the loop before each agent runs.

**Approach:**

- Add a `trimHistory(modelMessages: ModelMessage[]): ModelMessage[]` helper.
- Keep the **last K turns** verbatim (start with `K = 20` user/assistant pairs).
- If history exceeds K, drop the oldest turns. No summarization in v1 — a sliding window is enough to prevent the dead-conversation failure mode and it's one function with no extra LLM call.
- Never trim the in-flight tool/assistant messages we just appended via `[...modelMessages, ...response.messages]` (line 129) — those have to stay paired or the model errors on dangling tool calls.
- The system prompt is passed separately via `system:`, so it's untouched by trimming and stays cache-friendly.

**Why a sliding window over summarization:** summarization needs another model call, more prompt engineering, and creates a new failure mode (bad summary → model hallucinates context). Spark's qualifier+booker flow is short — most useful context lives in the last ~10 turns. Revisit if real conversations show the bot "forgetting" early facts.

## 2. Strip large tool-result payloads from carried history

**Where:** same file, at the handoff carry-forward point — `modelMessages = [...modelMessages, ...response.messages]` (line 129).

**Approach:**

- Add a `compactToolResults(messages: ModelMessage[]): ModelMessage[]` helper applied to `response.messages` before concatenation.
- For each tool-result message, replace the `output` payload with a short stub like `{ ok: true, summary: '<tool> returned N results' }` if the original payload exceeds a threshold (start with ~500 tokens / ~2KB serialized).
- `searchKnowledge` results are the main offender — they pull retrieved chunks that the model rarely needs two turns later, but currently every subsequent turn re-pays for them.
- Keep the tool-call message itself (the request) intact so the call/result pairing remains valid.
- Don't compact the _current turn's_ tool results — only when carrying them forward into the next agent's view.

## Out of scope for this change

- Server-side persistence of messages (still client-driven).
- Rate limiting / abuse caps.
- Catching context-length errors in `onError` and surfacing a "start fresh" message.
- Replacing the in-memory state `Map`.

These belong in separate changes and don't block the cost curve fix.

## Validation

- Manual: run a 30-turn conversation through `/chat` and watch `[turn:end]` logs for `tokens: in <N>` — input tokens should plateau, not climb linearly.
- Manual: trigger `searchKnowledge`, then chat 5+ more turns; check the carried history (log it once) and confirm the chunk payload is the stub, not the full result.
- No new tests for v1 — the orchestrator has no test harness yet and adding one is a bigger change.
