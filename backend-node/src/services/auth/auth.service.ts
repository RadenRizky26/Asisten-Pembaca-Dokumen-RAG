import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN ?? '7d';

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) return null;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
export function createToken(payload: object): string {
  return (jwt as any).sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}
export function decodeToken(token: string): any {
  return (jwt as any).verify(token, JWT_SECRET);
}
export async function getUserById(id: string): Promise<any | null> {
  const p = getPool();
  if (!p) return null;
  const r = await p.query('SELECT id, email, role FROM users WHERE id = $1', [id]);
  return r.rows[0] ?? null;
}
// autoClaim: if no users exist, first registered user becomes admin
export async function autoClaimRole(): Promise<'admin' | 'user'> {
  const p = getPool();
  if (!p) return 'admin';
  try { const r = await p.query('SELECT count(*)::int AS c FROM users'); return r.rows[0].c === 0 ? 'admin' : 'user'; }
  catch { return 'user'; }
}
export async function shouldAutoClaimAdmin(email: string): Promise<boolean> {
  return (await autoClaimRole()) === 'admin';
}
