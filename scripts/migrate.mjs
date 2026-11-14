import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error('Set DATABASE_URL_UNPOOLED before migrating.');
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 12000 });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(82741335)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const directory = new URL('../db/', import.meta.url);
  for (const file of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (applied.rowCount) continue;
    await client.query(await readFile(new URL(file, directory), 'utf8'));
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    console.log('Applied', file);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
