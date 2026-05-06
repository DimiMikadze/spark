import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseFile, SUPPORTED_EXTENSIONS } from '../rag/parse';
import { chunk as chunkText } from '../rag/chunk';
import { embedTexts } from '../rag/embed';
import { isDocumentIngested, insertDocumentWithChunks } from '../rag/queries';

const DOCS_DIR = join(process.cwd(), 'docs');

// OpenAI's embeddings endpoint accepts up to 2048 inputs per request, but in
// practice latency starts to suffer well before that. 96 keeps requests snappy
// while still amortising the round-trip cost across many chunks.
const EMBED_BATCH = 96;

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

// SHA-256 over the raw bytes — we use this as `documents.content_hash` so a
// re-run of `pnpm ingest` skips any file whose contents are unchanged. Editing
// a file changes the hash, which currently means a duplicate document row;
// add a "delete-then-reinsert" path if/when we care about updates.
async function hashFile(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}

async function ingestFile(path: string): Promise<'ingested' | 'skipped'> {
  const ext = extname(path).toLowerCase();
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    console.log(`skip   ${path} (unsupported extension)`);
    return 'skipped';
  }

  const hash = await hashFile(path);
  if (await isDocumentIngested(hash)) {
    console.log(`skip   ${path} (already ingested)`);
    return 'skipped';
  }

  console.log(`parse  ${path}`);
  const { text, format } = await parseFile(path);
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    console.log(`skip   ${path} (no extractable text)`);
    return 'skipped';
  }

  console.log(`embed  ${path} (${chunks.length} chunks)`);
  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const result = await embedTexts(batch.map((c) => c.content));
    embeddings.push(...result);
  }

  // The doc UUID is generated here (not in Postgres) so the document INSERT
  // and chunk INSERTs share an id inside one transaction. See the comment in
  // `rag/queries.ts → insertDocumentWithChunks`.
  await insertDocumentWithChunks({
    documentId: randomUUID(),
    sourcePath: relative(process.cwd(), path),
    contentHash: hash,
    format,
    chunks: chunks.map((c) => ({
      content: c.content,
      tokenCount: c.tokenCount,
      index: c.index,
    })),
    embeddings,
  });

  console.log(`saved  ${path}`);
  return 'ingested';
}

async function main() {
  try {
    await stat(DOCS_DIR);
  } catch {
    console.log(`docs/ directory not found at ${DOCS_DIR} — create it and add files.`);
    return;
  }

  let ingested = 0;
  let skipped = 0;
  for await (const path of walk(DOCS_DIR)) {
    const result = await ingestFile(path);
    if (result === 'ingested') ingested++;
    else skipped++;
  }
  console.log(`\ningested: ${ingested}, skipped: ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
