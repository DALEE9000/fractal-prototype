import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';

let pool;
export function database() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 8000 });
    if (process.env.VERCEL) attachDatabasePool(pool);
  }
  return pool;
}
