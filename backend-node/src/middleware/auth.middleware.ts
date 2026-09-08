import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth/auth.service.js';
import * as resHelper from '../utils/response.js';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    (req as any).user = null;
    return next();
  }
  const token = authHeader.slice(7);
  try {
    const payload = authService.decodeToken(token);
    if (!payload) {
      (req as any).user = null;
      return next();
    }
    (req as any).user = { id: payload.sub || payload.id, email: payload.email };
    next();
  } catch {
    (req as any).user = null;
    next();
  }
};