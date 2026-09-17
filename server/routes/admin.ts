import { Router } from 'express';
import type { Db } from '../db/client';

export function adminRouter(_db: Db) {
  return Router();
}
