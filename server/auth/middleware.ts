import type { Request, Response, NextFunction } from 'express';
import type { Db } from '../db/client';

export function requireAuth(_db: Db) {
  return (_req: Request, _res: Response, next: NextFunction) => next();
}

export function requireRole(_role: 'admin' | 'supplier') {
  return (_req: Request, _res: Response, next: NextFunction) => next();
}
