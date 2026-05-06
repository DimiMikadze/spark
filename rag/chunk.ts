const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 500;
const OVERLAP_TOKENS = 50;
const TARGET = TARGET_TOKENS * CHARS_PER_TOKEN;
const OVERLAP = OVERLAP_TOKENS * CHARS_PER_TOKEN;

export type Chunk = {
  content: string;
  index: number;
  tokenCount: number;
};

export function chunk(text: string): Chunk[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];

  const out: Chunk[] = [];
  let pos = 0;

  while (pos < normalized.length) {
    let end = Math.min(pos + TARGET, normalized.length);

    if (end < normalized.length) {
      const halfway = pos + Math.floor(TARGET / 2);
      const paraBreak = normalized.lastIndexOf('\n\n', end);
      if (paraBreak > halfway) {
        end = paraBreak;
      } else {
        const sentBreak = normalized.lastIndexOf('. ', end);
        if (sentBreak > halfway) end = sentBreak + 1;
      }
    }

    const content = normalized.slice(pos, end).trim();
    if (content) {
      out.push({
        content,
        index: out.length,
        tokenCount: Math.ceil(content.length / CHARS_PER_TOKEN),
      });
    }

    const next = end - OVERLAP;
    pos = next > pos ? next : end;
  }
  return out;
}
