// Loads an agent's prompt from disk and stitches in the shared style rules
// and the dynamic runtime footer.
//
// Why a `.md` file per agent: the prompt is the agent's product spec, not
// code. Keeping it as plain markdown makes diffs readable and lets us copy
// chunks straight from `botpress-prompts/` without escaping template strings.
//
// Why a stable prefix and a tiny dynamic footer: OpenAI's automatic prompt
// cache keys on the longest unchanged prefix sent in a request. Putting the
// changing bits (date, conversation id) at the end means every turn after
// the first hits the cache for the rest of the system message.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AGENTS_DIR = join(process.cwd(), 'agents');

// Read at module init: the file rarely changes during a server's lifetime,
// and we'd rather take the I/O hit once at boot than on every chat turn.
const STYLE_RULES = readFileSync(
  join(AGENTS_DIR, 'shared', 'style-rules.md'),
  'utf8',
);

function readAgentPrompt(agentName: 'qualifier' | 'booker'): string {
  // Re-read on each call so editing a prompt during `pnpm dev` takes effect
  // on the next chat turn without a server restart. The file is small.
  return readFileSync(join(AGENTS_DIR, agentName, 'prompt.md'), 'utf8');
}

export function loadPrompt(
  agentName: 'qualifier' | 'booker',
  args: { currentDate: string; conversationId: string },
): string {
  const body = readAgentPrompt(agentName);

  // The runtime footer is the only part that varies between turns. Keep it
  // tiny so the cacheable prefix stays as long as possible.
  return `${body}

${STYLE_RULES}

# Runtime context

Today is ${args.currentDate}.
Conversation id: ${args.conversationId}.`;
}
