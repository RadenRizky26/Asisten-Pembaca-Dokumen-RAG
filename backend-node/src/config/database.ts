import pg from 'pg';
import { env } from './env.js';
const { Pool } = pg;

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (_pool) return _pool;
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  _pool = new Pool({ connectionString: env.DATABASE_URL });
  return _pool;
}
export const pool = { get query() { return getPool().query.bind(getPool()); } } as pg.Pool;

export async function getRawConnection() {
  const p = getPool();
  return p.connect();
}

export async function initDb(): Promise<void> {
  if (!env.DATABASE_URL) return;
  const p = getPool();
  await p.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )`);
}
