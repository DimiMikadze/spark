import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from '../rag/db';

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `;

  const dir = join(process.cwd(), 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  const appliedRows = (await sql`SELECT name FROM _migrations`) as { name: string }[];
  const applied = new Set(appliedRows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const text = await readFile(join(dir, file), 'utf8');
    console.log(`apply ${file}`);

    const statements = text
      .replace(/--.*$/gm, '')
      .split(/;\s*(?:\n|$)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await sql.query(stmt);
    }

    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
  }

  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
