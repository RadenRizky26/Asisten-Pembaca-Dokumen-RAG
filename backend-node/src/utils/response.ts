import type { Response } from 'express';

export const ok = (res: Response, data: unknown, msg = 'OK') => res.json({ success: true, message: msg, data });
export const created = (res: Response, data: unknown, msg = 'Created') => res.status(201).json({ success: true, message: msg, data });
export const badRequest = (res: Response, msg = 'Bad request') => res.status(400).json({ success: false, message: msg });
export const unauthorized = (res: Response, msg = 'Unauthorized') => res.status(401).json({ success: false, message: msg });
export const notFound = (res: Response, msg = 'Not found') => res.status(404).json({ success: false, message: msg });
export const fail = (res: Response, msg = 'Internal error', code = 500) => res.status(code).json({ success: false, message: msg });
