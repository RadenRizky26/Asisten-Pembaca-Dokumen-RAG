import { Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { env } from '../config/env.js';
import { VectorStoreService } from '../services/rag/vector-store.service.js';
import * as resHelper from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { resolveSecurePath } from '../utils/filename.js';

const vectorStore = new VectorStoreService();

export const listFiles = async (req: Request, res: Response) => {
  const sources = await vectorStore.listSources('default').catch(() => []);
  resHelper.ok(res, { files: sources });
};

export const deleteFile = async (req: Request, res: Response) => {
  const filename = typeof req.params.filename === 'string' ? req.params.filename : req.params.filename[0];
  const uploadDir = env.UPLOAD_DIR || './uploads';
  const filePath = resolveSecurePath(uploadDir, filename);
  try { await fs.unlink(filePath); } catch (err: any) {
    if (err.code === 'ENOENT') return resHelper.notFound(res, 'File tidak ditemukan.');
    throw err;
  }
  await vectorStore.deleteBySource(filename);
  resHelper.ok(res, { status: 'sukses', pesan: `${filename} dihapus!` });
};

export const downloadFile = async (req: Request, res: Response) => {
  const filename = typeof req.params.filename === 'string' ? req.params.filename : req.params.filename[0];
  const uploadDir = env.UPLOAD_DIR || './uploads';
  const filePath = resolveSecurePath(uploadDir, filename);
  try { await fs.access(filePath); } catch { return resHelper.notFound(res, 'File tidak ditemukan.'); }
  res.download(filePath, filename);
};

export const previewFile = async (req: Request, res: Response) => {
  const filename = typeof req.params.filename === 'string' ? req.params.filename : req.params.filename[0];
  const uploadDir = env.UPLOAD_DIR || './uploads';
  const filePath = resolveSecurePath(uploadDir, filename);
  try { await fs.access(filePath); } catch { return resHelper.notFound(res, 'File tidak ditemukan.'); }
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') res.sendFile(filePath);
  else resHelper.badRequest(res, 'Preview hanya untuk PDF');
};