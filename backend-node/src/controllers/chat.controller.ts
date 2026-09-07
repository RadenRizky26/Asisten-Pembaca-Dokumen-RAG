import { Request, Response } from 'express';
import * as resHelper from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'node:crypto';

type Session = { id: string; title: string; messages: any[]; userId?: string; sessionId?: string };
const sessions = new Map<string, Session>();

export const chatStream = async (req: Request, res: Response) => {
  const { teks, selected_files, history, temperature, k } = req.body;
  if (!teks) return resHelper.badRequest(res, 'teks required');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // ponytail: LLM pipeline stubbed, forward to RAG service
  const answer = `Jawaban untuk: "${teks}" (stub)`;
  for (const char of answer) {
    res.write(`data: ${JSON.stringify({ token: char })}\\n\\n`);
  }
  res.write('data: [DONE]\\n\\n');
  res.end();
};

export const getSessions = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || null;
  const sessionId = req.headers['x-session-id'] as string || null;
  let list = Array.from(sessions.values());
  if (userId) list = list.filter(s => s.userId === userId);
  else if (sessionId) list = list.filter(s => s.sessionId === sessionId && !s.userId);
  else list = [];
  resHelper.ok(res, list);
};

export const createSession = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || null;
  const sessionId = typeof req.headers['x-session-id'] === 'string' ? req.headers['x-session-id'] : null;
  const id = randomUUID();
  const session: Session = { id, title: 'Percakapan baru', messages: [], userId: userId || undefined, sessionId: sessionId || undefined };
  sessions.set(id, session);
  resHelper.created(res, session);
};

export const updateSession = async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
  const { title, messages } = req.body;
  const session = sessions.get(id);
  if (!session) return resHelper.notFound(res, 'Sesi tidak ditemukan.');
  if (title) session.title = title;
  if (messages) session.messages = messages;
  sessions.set(id, session);
  resHelper.ok(res, session);
};

export const deleteSession = async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0];
  if (!sessions.has(id)) return resHelper.notFound(res, 'Sesi tidak ditemukan.');
  sessions.delete(id);
  resHelper.ok(res, { status: 'dihapus' });
};