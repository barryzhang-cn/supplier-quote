import express from 'express';
import path from 'node:path';
import type { Db } from './db/client';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { supplierRouter } from './routes/supplier';
import { requireAuth, requireRole } from './auth/middleware';

export function createApp(db: Db) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  const requireAuthMw = requireAuth(db);
  app.use('/api/auth', authRouter(db));
  app.use('/api/admin', requireAuthMw, requireRole(['admin', 'procurement']), adminRouter(db));
  app.use('/api', requireAuthMw, requireRole('supplier'), supplierRouter(db));

  const clientDir = path.resolve(process.cwd(), 'dist/client');
  app.use(express.static(clientDir));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.method !== 'GET') return next();
    res.sendFile(path.join(clientDir, 'index.html'), (err) => {
      if (err) next();
    });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in (err as object)) {
      return res.status(400).json({ error: '请求体不是合法 JSON' });
    }
    console.error(err);
    return res.status(500).json({ error: '服务器内部错误' });
  });

  return app;
}
