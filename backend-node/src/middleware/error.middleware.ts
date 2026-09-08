import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import * as resHelper from '../utils/response.js';

export const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Error:', err);
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  resHelper.fail(res, message, status);
};