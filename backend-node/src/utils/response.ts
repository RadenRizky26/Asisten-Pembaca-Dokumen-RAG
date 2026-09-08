import type { Response } from 'express';

export const ok = (res: Response, data: unknown) => res.json(data);
export const created = (res: Response, data: unknown) => res.status(201).json(data);
export const badRequest = (res: Response, detail = 'Bad request') => res.status(400).json({ detail });
export const unauthorized = (res: Response, detail = 'Unauthorized') => res.status(401).json({ detail });
export const notFound = (res: Response, detail = 'Not found') => res.status(404).json({ detail });
export const fail = (res: Response, detail = 'Internal error', code = 500) => res.status(code).json({ detail });
