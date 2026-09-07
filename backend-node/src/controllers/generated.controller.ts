import { Request, Response } from 'express';
import { env } from '../config/env.js';
import * as resHelper from '../utils/response.js';
import { resolveSecurePath } from '../utils/filename.js';
import fs from 'node:fs/promises';

export const downloadGenerated = async (req: Request, res: Response) => {
  const filename = typeof req.params.filename === 'string' ? req.params.filename : req.params.filename[0];
  const genDir = env.GENERATED_DIR || './generated';
  const filePath = resolveSecurePath(genDir, filename);
  try { await fs.access(filePath); } catch { return resHelper.notFound(res, 'File hasil tidak ditemukan.'); }
  res.download(filePath, filename);
};