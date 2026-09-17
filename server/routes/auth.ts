import { Router } from 'express';
import type { Db } from '../db/client';

export function authRouter(_db: Db) {
  return Router();
}
