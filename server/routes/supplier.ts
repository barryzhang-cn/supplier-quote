import { Router } from 'express';
import type { Db } from '../db/client';

export function supplierRouter(_db: Db) {
  return Router();
}
