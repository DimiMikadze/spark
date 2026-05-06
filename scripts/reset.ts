import { truncateDocumentsAndChunks } from '../spark/queries';

// Dev convenience: wipe all ingested data so you can re-run `pnpm ingest`
// from scratch. Does not touch chat sessions or messages — clear those by
// deleting the `spark_session` cookie in the browser.
async function main() {
  await truncateDocumentsAndChunks();
  console.log('reset: documents and chunks truncated');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
