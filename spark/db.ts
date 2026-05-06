import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to .env.local.');
}

// We use the Neon **HTTP** driver, not a Pool / Client. HTTP is stateless,
// per-query, and works in serverless environments without keeping a connection
// open between requests. The trade-off is that each `sql\`...\`` call is a
// single round-trip — multi-statement scripts must use `sql.transaction([...])`
// to be atomic. All actual queries live in `spark/queries.ts`; this file only
// exports the configured client.
export const sql = neon(process.env.DATABASE_URL);
