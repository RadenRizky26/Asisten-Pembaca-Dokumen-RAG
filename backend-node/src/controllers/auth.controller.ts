import { Request, Response } from 'express';
import * as authService from '../services/auth/auth.service.js';
import * as resHelper from '../utils/response.js';

export const register = async (req: Request, res: Response) => {
  const { email, password, session_id } = req.body;
  const hash = await authService.hashPassword(password);
  // Store user in DB... (skipping actual DB logic for brevity, assumed service handles it)
  resHelper.created(res, { email });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  resHelper.ok(res, { token: 'mock-token', user: { email } });
};

export const me = async (req: Request, res: Response) => {
  resHelper.ok(res, { email: 'user@example.com' });
};
