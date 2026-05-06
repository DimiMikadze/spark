import { truncateAll } from '../rag/queries';

// Full reset: clears ingested knowledge AND chat history. Use this when you
// want a blank-slate database for demos or to drop stale document rows that
// `pnpm db:reset` (docs-only) wouldn't touch.
async function main() {
  await truncateAll();
  console.log('wipe: documents, chunks, chat_sessions, messages truncated');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
