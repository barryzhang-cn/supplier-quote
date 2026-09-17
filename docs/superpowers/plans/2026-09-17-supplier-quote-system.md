# 供应商报价系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 采购方发布招标、供应商在线报价并实时查看名次的内网 Docker 应用（单 Node 容器 + 复用 1Panel Postgres）。

**Architecture:** Express + TypeScript 后端与 Vite 构建的 React 静态文件由同一 Node 进程托管；Drizzle ORM 连接现有 1Panel postgres（专用 database `supplier_quote`，容器网络上主机名 `postgresql`）；认证用 scrypt 密码哈希 + JWT；截止锁定在事务内以数据库时间为准；供应商数据隔离全部在服务端强制。

**Tech Stack:** Node 22 / Express 4 / Drizzle ORM (postgres-js) / zod / jsonwebtoken / React 18 / Vite / Tailwind CSS 3 / shadcn 风格手写组件 / Vitest + supertest / Docker (node:22-alpine)

**Spec:** `docs/superpowers/specs/2026-09-17-supplier-quote-system-design.md`

**工作目录:** 全程 `/home/gdby/supplier-quote`（git 仓库已初始化，设计文档已提交）。

**约定:**
- 所有测试通过 `npm test` 运行（vitest，`fileParallelism: false`，共享测试库）。
- 每个 Task 结尾 commit；测试不过不许 commit。
- 服务器 `TZ=Asia/Shanghai`；截止判定用数据库驱动的时间比较，前端时间仅作展示。

---

## File Structure（最终形态）

```
supplier-quote/
├── package.json / tsconfig.json / vite.config.ts / vitest.config.ts
├── index.html / tailwind.config.js / postcss.config.js
├── drizzle.config.ts / drizzle/            # 迁移文件
├── .env / .env.example / .gitignore
├── server/
│   ├── index.ts        # 启动入口：migrate → seed → listen
│   ├── env.ts          # 环境变量解析
│   ├── app.ts          # createApp(db) 工厂：路由挂载 + 静态托管
│   ├── seed.ts         # 首次启动 seed 初始管理员
│   ├── auth/
│   │   ├── password.ts # scrypt hash/verify
│   │   ├── jwt.ts      # sign/verify
│   │   └── middleware.ts # requireAuth / requireRole
│   ├── db/
│   │   ├── client.ts   # drizzle 实例 + Db 类型 + closeDb
│   │   ├── schema.ts   # users / tenders / quotes
│   │   └── migrate.ts  # 程序化迁移
│   ├── routes/
│   │   ├── auth.ts     # POST /login, GET /me
│   │   ├── admin.ts    # users 管理 + tenders 管理 + 完整榜单
│   │   └── supplier.ts # 招标列表/详情、报价 upsert、名次
│   └── services/
│       └── ranking.ts  # 名次计算（JS 侧，数据量小）
├── tests/
│   ├── setup.ts        # 测试库 migrate + truncate + app 工厂
│   ├── helpers.ts      # 造数 + 登录工具
│   ├── password.test.ts / jwt.test.ts
│   ├── health.test.ts / auth-routes.test.ts / middleware.test.ts
│   ├── admin-users.test.ts / admin-tenders.test.ts
│   ├── supplier-tenders.test.ts / quote-upsert.test.ts / ranking.test.ts
├── src/                # 前端
│   ├── main.tsx / App.tsx / index.css
│   ├── lib/utils.ts / api.ts / auth-context.tsx / use-polling.ts
│   ├── components/ui/{button,input,label,textarea,card,table,badge}.tsx
│   └── pages/{LoginPage,SupplierTendersPage,SupplierTenderDetailPage,
│             AdminTendersPage,AdminTenderNewPage,AdminTenderDetailPage,
│             AdminUsersPage}.tsx
├── Dockerfile / docker-compose.yml
```

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `tailwind.config.js`, `postcss.config.js`, `src/index.css`, `src/main.tsx`, `src/App.tsx`, `.gitignore`, `.env.example`

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "supplier-quote",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:server": "tsx watch server/index.ts",
    "dev:web": "vite",
    "build": "vite build",
    "start": "tsx server/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx server/db/migrate.ts"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "drizzle-orm": "^0.44.2",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.2",
    "postgres": "^3.4.7",
    "tsx": "^4.19.2",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.10.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@types/supertest": "^6.0.2",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "drizzle-kit": "^0.30.1",
    "postcss": "^8.4.49",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "supertest": "^7.0.0",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.7.2",
    "vite": "^5.4.11",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: 写配置文件**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["vite/client"]
  },
  "include": ["src", "server", "tests", "vite.config.ts", "vitest.config.ts", "drizzle.config.ts"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: { outDir: 'dist/client' },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
  },
});
```

`tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)' },
    },
  },
  plugins: [],
};
```

`postcss.config.js`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>供应商报价系统</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`（设计规范 tokens）:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 210 40% 98%;
    --foreground: 222 47% 11%;
    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;
    --primary: 221 83% 53%;
    --primary-foreground: 0 0% 100%;
    --muted: 210 40% 96%;
    --muted-foreground: 215 16% 47%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 100%;
    --border: 214 32% 91%;
    --input: 214 32% 91%;
    --ring: 221 83% 53%;
    --radius: 0.5rem;
  }
  body {
    @apply bg-background text-foreground text-sm antialiased;
  }
}
```

`src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

`src/App.tsx`（骨架，路由后续 Task 填充）:

```tsx
export default function App() {
  return <div className="mx-auto max-w-[1200px] p-6">供应商报价系统</div>;
}
```

`.gitignore`:

```
node_modules/
dist/
.env
*.log
```

`.env.example`:

```
# 本机开发用（host 直连 5432）；容器内改用 postgresql 主机名，见 docker-compose.yml
DATABASE_URL=postgres://supplier_quote:CHANGE_ME@localhost:5432/supplier_quote
JWT_SECRET=CHANGE_ME_48_HEX
ADMIN_USERNAME=admin
ADMIN_PASSWORD=CHANGE_ME_MIN_8
```

- [ ] **Step 3: 安装依赖并验证**

Run: `npm install`
Expected: 无 error 退出。

Run: `npm run build`
Expected: `dist/client/` 生成，无报错。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts tailwind.config.js postcss.config.js index.html src/index.css src/main.tsx src/App.tsx .gitignore .env.example
git commit -m "chore: 项目脚手架（Vite+React+Tailwind+TS 配置）"
```

---

### Task 2: Postgres 供给 + 数据库 Schema + 首次迁移

**Files:**
- Create: `server/db/schema.ts`, `server/db/client.ts`, `server/db/migrate.ts`, `drizzle.config.ts`, `.env`（不入库）

**前置事实（已勘察确认）:**
- 1Panel postgres 容器: `1Panel-postgresql-NSJt`（postgres:18.6-alpine），宿主机 5432 已映射
- 超级用户: `user_crcW5z`（docker exec 免密）
- docker 网络: `1panel-network`，容器别名 `postgresql`（容器互联用它，不走 ufw）

- [ ] **Step 1: 生成密码并创建角色与数据库**

```bash
DB_PASS=$(openssl rand -hex 24)
echo "DB_PASS=$DB_PASS"  # 记下此值，写 .env 用
docker exec 1Panel-postgresql-NSJt psql -U user_crcW5z -c "CREATE ROLE supplier_quote LOGIN PASSWORD '$DB_PASS';"
docker exec 1Panel-postgresql-NSJt psql -U user_crcW5z -c "CREATE DATABASE supplier_quote OWNER supplier_quote;"
docker exec 1Panel-postgresql-NSJt psql -U user_crcW5z -c "CREATE DATABASE supplier_quote_test OWNER supplier_quote;"
```

Expected: 三条 CREATE 成功。

- [ ] **Step 2: 写 .env（本机开发用）**

`.env`（**不提交**，已在 .gitignore）:

```
DATABASE_URL=postgres://supplier_quote:<上面生成的DB_PASS>@localhost:5432/supplier_quote
JWT_SECRET=<openssl rand -hex 24 生成>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<初始管理员密码，≥8位>
```

- [ ] **Step 3: 写 schema**

`server/db/schema.ts`:

```ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  numeric,
  boolean,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['admin', 'supplier']);
export const tenderStatus = pgEnum('tender_status', ['open', 'closed']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('supplier'),
  companyName: text('company_name'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenders = pgTable('tenders', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  status: tenderStatus('status').notNull().default('open'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenderId: uuid('tender_id')
      .notNull()
      .references(() => tenders.id),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => users.id),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    note: text('note'),
    // 首次提交时间 = 名次平局判定依据，更新报价时永不修改
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('quotes_tender_supplier_uq').on(t.tenderId, t.supplierId)],
);
```

- [ ] **Step 4: 写 client 与 migrate**

`server/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let client: postgres.Sql | null = null;
let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    client = postgres(process.env.DATABASE_URL!, { max: 10 });
    _db = drizzle(client, { schema });
  }
  return _db;
}

export const db: Db = new Proxy({} as Db, {
  get(_t, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export async function closeDb() {
  await client?.end();
  client = null;
  _db = null;
}
```

`server/db/migrate.ts`:

```ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb } from './client';

export async function runMigrations() {
  await migrate(getDb(), { migrationsFolder: 'drizzle' });
}
```

`drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 5: 生成并执行迁移**

Run: `npm run db:generate`
Expected: `drizzle/0000_*.sql` 生成（users/tenders/quotes 三表 + 两个 enum + 唯一索引）。

Run: `npm run db:migrate`
Expected: 无报错退出。

Run: `docker exec 1Panel-postgresql-NSJt psql -U user_crcW5z -d supplier_quote -c '\dt'`
Expected: 列出 `users`、`tenders`、`quotes` 三张表。

- [ ] **Step 6: 类型检查**

Run: `npm run typecheck`
Expected: 无错误。（若 `Db` 类型报错，改为 `export type Db = PostgresJsDatabase<typeof schema>`，从 `drizzle-orm/postgres-js` 导入 `PostgresJsDatabase`。）

- [ ] **Step 7: Commit**

```bash
git add server/db/ drizzle.config.ts drizzle/
git commit -m "feat: 数据库 schema（users/tenders/quotes）+ drizzle 迁移"
```

---

### Task 3: 密码哈希（TDD）

**Files:**
- Create: `server/auth/password.ts`, `tests/password.test.ts`

- [ ] **Step 1: 写失败测试** `tests/password.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../server/auth/password';

describe('password', () => {
  it('正确密码验证通过', () => {
    const hash = hashPassword('Passw0rd!123');
    expect(verifyPassword('Passw0rd!123', hash)).toBe(true);
  });

  it('错误密码验证失败', () => {
    const hash = hashPassword('Passw0rd!123');
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('同一密码两次哈希产生不同 salt（防彩虹表）', () => {
    expect(hashPassword('abc')).not.toBe(hashPassword('abc'));
  });

  it('格式损坏的 hash 返回 false 而不是抛异常', () => {
    expect(verifyPassword('abc', 'garbage')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/password.test.ts`
Expected: FAIL — 找不到 `../server/auth/password`。

- [ ] **Step 3: 实现** `server/auth/password.ts`:

```ts
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(plain, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/password.test.ts`
Expected: 4 passed。

- [ ] **Step 5: Commit**

```bash
git add server/auth/password.ts tests/password.test.ts
git commit -m "feat: scrypt 密码哈希"
```

---

### Task 4: JWT 工具（TDD）

**Files:**
- Create: `server/auth/jwt.ts`, `tests/jwt.test.ts`

- [ ] **Step 1: 写失败测试** `tests/jwt.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { signToken, verifyToken } from '../server/auth/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
});

describe('jwt', () => {
  it('sign 后 verify 返回原 payload', () => {
    const token = signToken({ sub: 'u-1', role: 'supplier' });
    expect(verifyToken(token)).toEqual({ sub: 'u-1', role: 'supplier' });
  });

  it('过期 token 返回 null', () => {
    const token = jwt.sign({ sub: 'u-1', role: 'admin' }, process.env.JWT_SECRET!, {
      expiresIn: '-10s',
    });
    expect(verifyToken(token)).toBeNull();
  });

  it('篡改的 token 返回 null', () => {
    const token = signToken({ sub: 'u-1', role: 'supplier' });
    expect(verifyToken(token + 'x')).toBeNull();
  });

  it('role 非法返回 null', () => {
    const token = jwt.sign({ sub: 'u-1', role: 'hacker' }, process.env.JWT_SECRET!, {
      expiresIn: '1h',
    });
    expect(verifyToken(token)).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/jwt.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现** `server/auth/jwt.ts`:

```ts
import jwt from 'jsonwebtoken';

export type Role = 'admin' | 'supplier';

export interface TokenPayload {
  sub: string;
  role: Role;
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET 未配置或长度不足 16');
  return s;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: '24h' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret());
    if (typeof decoded === 'string') return null;
    const { sub, role } = decoded as jwt.JwtPayload;
    if (typeof sub !== 'string' || (role !== 'admin' && role !== 'supplier')) return null;
    return { sub, role };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/jwt.test.ts`
Expected: 4 passed。

- [ ] **Step 5: Commit**

```bash
git add server/auth/jwt.ts tests/jwt.test.ts
git commit -m "feat: JWT 签发与校验"
```

---

### Task 5: 测试基建 + app 工厂 + health（TDD）

**Files:**
- Create: `tests/setup.ts`, `tests/helpers.ts`, `server/env.ts`, `server/app.ts`, `tests/health.test.ts`

- [ ] **Step 1: 写测试基建** `tests/setup.ts`:

```ts
import 'dotenv/config';
import { beforeAll, beforeEach, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';

// 测试统一用 supplier_quote_test 库
const url = new URL(process.env.DATABASE_URL ?? 'postgres://supplier_quote@localhost:5432/supplier_quote');
url.pathname = '/supplier_quote_test';
process.env.DATABASE_URL = url.toString();

export const rawClient = postgres(process.env.DATABASE_URL, { max: 1 });
export const testDb = drizzle(rawClient, { schema: {} as never }) as never;

beforeAll(async () => {
  await migrate(testDb as never, { migrationsFolder: 'drizzle' });
});

beforeEach(async () => {
  await rawClient`TRUNCATE quotes, tenders, users CASCADE`;
});

afterAll(async () => {
  await rawClient.end();
});
```

注意：上面 `drizzle(..., { schema: {} as never })` 类型戏法不优雅——改成直接复用 client 工厂。**实际写法：**

```ts
import 'dotenv/config';
import { beforeAll, beforeEach, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '../server/db/schema';

process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';

const url = new URL(
  process.env.DATABASE_URL ?? 'postgres://supplier_quote@localhost:5432/supplier_quote',
);
url.pathname = '/supplier_quote_test';
process.env.DATABASE_URL = url.toString();

export const rawClient = postgres(process.env.DATABASE_URL, { max: 1 });
export const testDb = drizzle(rawClient, { schema });

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: 'drizzle' });
});

beforeEach(async () => {
  await rawClient`TRUNCATE quotes, tenders, users CASCADE`;
});

afterAll(async () => {
  await rawClient.end();
});
```

- [ ] **Step 2: 写 helpers** `tests/helpers.ts`:

```ts
import request from 'supertest';
import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { users } from '../server/db/schema';
import { hashPassword } from '../server/auth/password';
import type { Db } from '../server/db/client';

export async function insertUser(
  db: Db,
  opts: { username: string; role?: 'admin' | 'supplier'; companyName?: string | null; active?: boolean; password?: string },
) {
  const password = opts.password ?? 'Passw0rd!123';
  const [u] = await db
    .insert(users)
    .values({
      username: opts.username,
      passwordHash: hashPassword(password),
      role: opts.role ?? 'supplier',
      companyName: opts.companyName ?? null,
      active: opts.active ?? true,
    })
    .returning();
  return { user: u, password };
}

export async function loginToken(app: Express, username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
```

- [ ] **Step 3: 写 env 与失败测试**

`server/env.ts`:

```ts
import 'dotenv/config';

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`环境变量 ${name} 未配置`);
  return v;
}
```

`tests/health.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';

describe('GET /api/health', () => {
  it('返回 ok', async () => {
    const app = createApp(testDb);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 4: 运行确认失败**

Run: `npx vitest run tests/health.test.ts`
Expected: FAIL — `createApp` 不存在。

- [ ] **Step 5: 实现 app 工厂** `server/app.ts`（auth/admin/supplier 路由文件先建空壳以通过 import）:

先建三个空壳路由文件：

`server/routes/auth.ts`:

```ts
import { Router } from 'express';
import type { Db } from '../db/client';

export function authRouter(_db: Db) {
  return Router();
}
```

`server/routes/admin.ts`:

```ts
import { Router } from 'express';
import type { Db } from '../db/client';

export function adminRouter(_db: Db) {
  return Router();
}
```

`server/routes/supplier.ts`:

```ts
import { Router } from 'express';
import type { Db } from '../db/client';

export function supplierRouter(_db: Db) {
  return Router();
}
```

`server/auth/middleware.ts`（空壳，Task 6 填充）:

```ts
import type { Request, Response, NextFunction } from 'express';
import type { Db } from '../db/client';

export function requireAuth(_db: Db) {
  return (_req: Request, _res: Response, next: NextFunction) => next();
}

export function requireRole(_role: 'admin' | 'supplier') {
  return (_req: Request, _res: Response, next: NextFunction) => next();
}
```

`server/app.ts`:

```ts
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
  app.use('/api/admin', requireAuthMw, requireRole('admin'), adminRouter(db));
  app.use('/api', requireAuthMw, requireRole('supplier'), supplierRouter(db));

  // 生产环境托管前端静态文件 + SPA fallback；开发时 dist/client 不存在则跳过
  const clientDir = path.resolve(process.cwd(), 'dist/client');
  app.use(express.static(clientDir));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.method !== 'GET') return next();
    res.sendFile(path.join(clientDir, 'index.html'), (err) => {
      if (err) next();
    });
  });

  // 统一错误处理（含 JSON 解析错误）
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in (err as object)) {
      return res.status(400).json({ error: '请求体不是合法 JSON' });
    }
    console.error(err);
    return res.status(500).json({ error: '服务器内部错误' });
  });

  return app;
}
```

- [ ] **Step 6: 运行确认通过**

Run: `npx vitest run tests/health.test.ts`
Expected: 1 passed。

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add tests/ server/app.ts server/env.ts server/routes/ server/auth/middleware.ts
git commit -m "feat: app 工厂 + 测试基建 + health"
```

---

### Task 6: 认证中间件（TDD）

**Files:**
- Modify: `server/auth/middleware.ts`（替换空壳）
- Create: `tests/middleware.test.ts`

- [ ] **Step 1: 写失败测试** `tests/middleware.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';

describe('requireAuth / requireRole', () => {
  it('无 token 访问受保护接口返回 401', async () => {
    const app = createApp(testDb);
    const res = await request(app).get('/api/tenders');
    expect(res.status).toBe(401);
  });

  it('无效 token 返回 401', async () => {
    const app = createApp(testDb);
    const res = await request(app).get('/api/tenders').set(auth('bad-token'));
    expect(res.status).toBe(401);
  });

  it('停用账号即使 token 有效也返回 403', async () => {
    const app = createApp(testDb);
    const { user } = await insertUser(testDb, { username: 'sup1', active: false });
    // 直接给 active 用户发 token 再停用：先启用登录，再改 active
    await testDb.update(users).set({ active: true }).where(eq(users.id, user.id));
    const token = await loginToken(app, 'sup1', 'Passw0rd!123');
    await testDb.update(users).set({ active: false }).where(eq(users.id, user.id));
    const res = await request(app).get('/api/tenders').set(auth(token));
    expect(res.status).toBe(403);
  });

  it('供应商访问管理员接口返回 403', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'sup1' });
    const token = await loginToken(app, 'sup1', 'Passw0rd!123');
    const res = await request(app).get('/api/admin/users').set(auth(token));
    expect(res.status).toBe(403);
  });

  it('管理员访问供应商接口返回 403', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app).get('/api/tenders').set(auth(token));
    expect(res.status).toBe(403);
  });
});
```

文件顶部需额外导入：

```ts
import { eq } from 'drizzle-orm';
import { users } from '../server/db/schema';
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/middleware.test.ts`
Expected: FAIL — 空壳中间件不拦截（401 用例得到 404/200 等）。

- [ ] **Step 3: 实现真实中间件**（替换 `server/auth/middleware.ts` 全部内容）:

```ts
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';
import { verifyToken } from './jwt';
import type { Db } from '../db/client';

export interface AuthedUser {
  id: string;
  username: string;
  role: 'admin' | 'supplier';
  companyName: string | null;
}

export interface AuthedRequest extends Request {
  user: AuthedUser;
}

export function currentUser(req: Request): AuthedUser {
  return (req as AuthedRequest).user;
}

export function requireAuth(db: Db) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });
    const payload = verifyToken(header.slice(7));
    if (!payload) return res.status(401).json({ error: '登录已过期，请重新登录' });
    const [u] = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        companyName: users.companyName,
        active: users.active,
      })
      .from(users)
      .where(eq(users.id, payload.sub));
    if (!u) return res.status(401).json({ error: '账号不存在' });
    if (!u.active) return res.status(403).json({ error: '账号已停用' });
    (req as AuthedRequest).user = u;
    next();
  };
}

export function requireRole(role: 'admin' | 'supplier') {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthedRequest).user;
    if (!user || user.role !== role) return res.status(403).json({ error: '无权限' });
    next();
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/middleware.test.ts`
Expected: 5 passed。

- [ ] **Step 5: Commit**

```bash
git add server/auth/middleware.ts tests/middleware.test.ts
git commit -m "feat: 认证中间件（JWT 校验 + 停用拦截 + 角色控制）"
```

---

### Task 7: 登录接口 + 初始管理员 seed（TDD）

**Files:**
- Modify: `server/routes/auth.ts`（替换空壳）
- Create: `server/seed.ts`, `tests/auth-routes.test.ts`

- [ ] **Step 1: 写失败测试** `tests/auth-routes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';

describe('POST /api/auth/login', () => {
  it('正确凭据返回 token 和用户信息', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sup1', password: 'Passw0rd!123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ username: 'sup1', role: 'supplier', companyName: '甲公司' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('密码错误返回 401', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'sup1' });
    const res = await request(app).post('/api/auth/login').send({ username: 'sup1', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('不存在的用户返回 401', async () => {
    const app = createApp(testDb);
    const res = await request(app).post('/api/auth/login').send({ username: 'ghost', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('停用账号返回 403', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'sup2', active: false });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sup2', password: 'Passw0rd!123' });
    expect(res.status).toBe(403);
  });

  it('参数缺失返回 422', async () => {
    const app = createApp(testDb);
    const res = await request(app).post('/api/auth/login').send({ username: 'sup1' });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/auth/me', () => {
  it('有效 token 返回当前用户', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app).get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('boss');
    expect(res.body.user.role).toBe('admin');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/auth-routes.test.ts`
Expected: FAIL — 登录接口 404。

- [ ] **Step 3: 实现** `server/routes/auth.ts`（替换全部）:

```ts
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../db/schema';
import { verifyPassword } from '../auth/password';
import { signToken } from '../auth/jwt';
import { requireAuth, currentUser } from '../auth/middleware';
import type { Db } from '../db/client';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export function authRouter(db: Db) {
  const r = Router();

  r.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: '请输入用户名和密码' });
    const { username, password } = parsed.data;
    const [u] = await db.select().from(users).where(eq(users.username, username));
    if (!u || !verifyPassword(password, u.passwordHash)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    if (!u.active) return res.status(403).json({ error: '账号已停用，请联系管理员' });
    const token = signToken({ sub: u.id, role: u.role });
    return res.json({
      token,
      user: { id: u.id, username: u.username, role: u.role, companyName: u.companyName },
    });
  });

  r.get('/me', requireAuth(db), (req, res) => {
    res.json({ user: currentUser(req) });
  });

  return r;
}
```

- [ ] **Step 4: 实现 seed** `server/seed.ts`:

```ts
import { eq } from 'drizzle-orm';
import { users } from './db/schema';
import { hashPassword } from './auth/password';
import type { Db } from './db/client';

export async function seedAdmin(db: Db) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);
  if (existing) return;
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('首次启动需要 ADMIN_PASSWORD（至少 8 位）以创建初始管理员');
  }
  await db.insert(users).values({ username, passwordHash: hashPassword(password), role: 'admin' });
  console.log(`已创建初始管理员: ${username}`);
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/auth-routes.test.ts`
Expected: 6 passed。

Run: `npm test`
Expected: 全部通过（回归）。

- [ ] **Step 6: Commit**

```bash
git add server/routes/auth.ts server/seed.ts tests/auth-routes.test.ts
git commit -m "feat: 登录接口 + 初始管理员 seed"
```

---

### Task 8: 管理员-供应商账号管理（TDD）

**Files:**
- Modify: `server/routes/admin.ts`（替换空壳）
- Create: `tests/admin-users.test.ts`

- [ ] **Step 1: 写失败测试** `tests/admin-users.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';

describe('管理员-供应商账号管理', () => {
  it('新建供应商账号成功（companyName 必填）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(token))
      .send({ username: 'sup1', password: 'InitPass!234', companyName: '甲公司' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'sup1', companyName: '甲公司', role: 'supplier' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('重复用户名返回 409', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(token))
      .send({ username: 'sup1', password: 'InitPass!234', companyName: '乙公司' });
    expect(res.status).toBe(409);
  });

  it('密码少于 8 位返回 422', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(token))
      .send({ username: 'sup2', password: '123', companyName: '乙公司' });
    expect(res.status).toBe(422);
  });

  it('列表只含供应商且不泄露密码哈希', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    await insertUser(testDb, { username: 'other_admin', role: 'admin' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app).get('/api/admin/users').set(auth(token));
    expect(res.status).toBe(200);
    const names = res.body.users.map((u: { username: string }) => u.username);
    expect(names).toContain('sup1');
    expect(names).not.toContain('boss');
    expect(names).not.toContain('other_admin');
    expect(res.body.users[0]).not.toHaveProperty('passwordHash');
  });

  it('重置密码后新密码可登录', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .patch('/api/admin/users/x') // id 占位，下面用真实 id
      .set(auth(token))
      .send({ password: 'NewPass!5678' });
    // 先拿真实 id 再测
    const list = await request(app).get('/api/admin/users').set(auth(token));
    const id = list.body.users.find((u: { username: string }) => u.username === 'sup1').id;
    const ok = await request(app).patch(`/api/admin/users/${id}`).set(auth(token)).send({ password: 'NewPass!5678' });
    expect(ok.status).toBe(200);
    expect(res.status).toBe(404); // 占位 id 不存在
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sup1', password: 'NewPass!5678' });
    expect(login.status).toBe(200);
  });

  it('停用供应商后无法登录', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const { user } = await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app).patch(`/api/admin/users/${user.id}`).set(auth(token)).send({ active: false });
    expect(res.status).toBe(200);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sup1', password: 'Passw0rd!123' });
    expect(login.status).toBe(403);
  });
});
```

注意重置密码用例写复杂了——拆成两个独立用例更清晰。**实际用例：**

```ts
  it('重置密码后新密码可登录、旧密码失效', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const { user } = await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set(auth(token))
      .send({ password: 'NewPass!5678' });
    expect(res.status).toBe(200);
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sup1', password: 'NewPass!5678' });
    expect(newLogin.status).toBe(200);
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sup1', password: 'Passw0rd!123' });
    expect(oldLogin.status).toBe(401);
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/admin-users.test.ts`
Expected: FAIL — admin 路由为空壳，404。

- [ ] **Step 3: 实现** `server/routes/admin.ts`（替换全部；tenders 管理路由 Task 9 补充，本任务先只写 users 部分）:

```ts
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../db/schema';
import { hashPassword } from '../auth/password';
import type { Db } from '../db/client';

const createUserSchema = z.object({
  username: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[\w.-]+$/, '用户名仅限字母、数字、._-'),
  password: z.string().min(8, '密码至少 8 位').max(72),
  companyName: z.string().min(1, '公司名称必填').max(100),
});

const patchUserSchema = z.object({
  password: z.string().min(8, '密码至少 8 位').max(72).optional(),
  active: z.boolean().optional(),
});

export function adminRouter(db: Db) {
  const r = Router();

  r.get('/users', async (_req, res) => {
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        companyName: users.companyName,
        active: users.active,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.role, 'supplier'))
      .orderBy(users.createdAt);
    res.json({ users: rows });
  });

  r.post('/users', async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });
    const { username, password, companyName } = parsed.data;
    const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (dup) return res.status(409).json({ error: '用户名已存在' });
    const [u] = await db
      .insert(users)
      .values({
        username,
        passwordHash: hashPassword(password),
        role: 'supplier',
        companyName,
      })
      .returning({ id: users.id, username: users.username, companyName: users.companyName, role: users.role });
    return res.status(201).json({ user: u });
  });

  r.patch('/users/:id', async (req, res) => {
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });
    const values: { passwordHash?: string; active?: boolean } = {};
    if (parsed.data.password) values.passwordHash = hashPassword(parsed.data.password);
    if (parsed.data.active !== undefined) values.active = parsed.data.active;
    if (Object.keys(values).length === 0) return res.status(422).json({ error: '无可更新字段' });
    const [u] = await db
      .update(users)
      .set(values)
      .where(eq(users.id, req.params.id))
      .returning({ id: users.id, username: users.username, active: users.active });
    if (!u) return res.status(404).json({ error: '用户不存在' });
    return res.json({ user: u });
  });

  return r;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/admin-users.test.ts`
Expected: 6 passed。

- [ ] **Step 5: Commit**

```bash
git add server/routes/admin.ts tests/admin-users.test.ts
git commit -m "feat: 管理员供应商账号管理（创建/列表/重置密码/停用）"
```

---

### Task 9: 管理员-招标 CRUD + 完整榜单 + 提前关闭（TDD）

**Files:**
- Modify: `server/routes/admin.ts`（追加 tenders 路由）
- Create: `server/services/ranking.ts`, `tests/admin-tenders.test.ts`

- [ ] **Step 1: 写名次服务**（先写实现，它的 TDD 在 Task 12 做行为验证；此处是纯函数，供 admin/supplier 复用）

`server/services/ranking.ts`:

```ts
export interface RankableQuote {
  supplierId: string;
  amount: string;
  createdAt: Date;
}

/**
 * 名次规则：金额低者靠前；金额相同，首次提交（createdAt）早者靠前。
 * 返回 supplierId → 名次（1 起）的映射。
 */
export function computeRanks(quotes: RankableQuote[]): Map<string, number> {
  const sorted = [...quotes].sort((a, b) => {
    const byAmount = Number(a.amount) - Number(b.amount);
    if (byAmount !== 0) return byAmount;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const ranks = new Map<string, number>();
  sorted.forEach((q, i) => ranks.set(q.supplierId, i + 1));
  return ranks;
}
```

- [ ] **Step 2: 写失败测试** `tests/admin-tenders.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';
import { tenders, quotes } from '../server/db/schema';

async function setupAdmin(app: ReturnType<typeof createApp>) {
  await insertUser(testDb, { username: 'boss', role: 'admin' });
  const token = await loginToken(app, 'boss', 'Passw0rd!123');
  return { token };
}

describe('管理员-招标管理', () => {
  it('新建招标成功，截止时间必须在未来', async () => {
    const app = createApp(testDb);
    const { token } = await setupAdmin(app);
    const ok = await request(app)
      .post('/api/admin/tenders')
      .set(auth(token))
      .send({ title: '打印机采购', description: 'A4 激光打印机 5 台', deadline: new Date(Date.now() + 86400_000).toISOString() });
    expect(ok.status).toBe(201);
    expect(ok.body.tender.status).toBe('open');

    const past = await request(app)
      .post('/api/admin/tenders')
      .set(auth(token))
      .send({ title: '过期招标', deadline: new Date(Date.now() - 1000).toISOString() });
    expect(past.status).toBe(422);
  });

  it('列表带报价数统计', async () => {
    const app = createApp(testDb);
    const { token } = await setupAdmin(app);
    const boss = (await testDb.select().from((await import('../server/db/schema')).users)).find(
      (u: { username: string }) => u.username === 'boss',
    );
    const [t1] = await testDb
      .insert(tenders)
      .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: boss.id })
      .returning();
    const sup = await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    await testDb.insert(quotes).values({ tenderId: t1.id, supplierId: sup.user.id, amount: '100.00' });
    const res = await request(app).get('/api/admin/tenders').set(auth(token));
    expect(res.status).toBe(200);
    const row = res.body.tenders.find((t: { id: string }) => t.id === t1.id);
    expect(row.quoteCount).toBe(1);
  });

  it('详情返回完整报价榜（名次+公司名）', async () => {
    const app = createApp(testDb);
    const { token } = await setupAdmin(app);
    const usersTable = (await import('../server/db/schema')).users;
    const boss = (await testDb.select().from(usersTable)).find(
      (u: { username: string }) => u.username === 'boss',
    );
    const [t1] = await testDb
      .insert(tenders)
      .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: boss.id })
      .returning();
    const a = await insertUser(testDb, { username: 'sup_a', companyName: '甲公司' });
    const b = await insertUser(testDb, { username: 'sup_b', companyName: '乙公司' });
    const t0 = new Date('2026-09-17T08:00:00Z');
    // 同价 100.00：a 首提更早 → a 第 1
    await testDb.insert(quotes).values([
      { tenderId: t1.id, supplierId: b.user.id, amount: '100.00', createdAt: t0, updatedAt: t0 },
      { tenderId: t1.id, supplierId: a.user.id, amount: '100.00', createdAt: new Date(t0.getTime() + 1000), updatedAt: new Date(t0.getTime() + 1000) },
    ]);
    const res = await request(app).get(`/api/admin/tenders/${t1.id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.quotes).toHaveLength(2);
    expect(res.body.quotes[0]).toMatchObject({ companyName: '乙公司', rank: 1, amount: '100.00' });
    expect(res.body.quotes[1]).toMatchObject({ companyName: '甲公司', rank: 2 });
  });

  it('开放中可编辑；已截止后编辑返回 409', async () => {
    const app = createApp(testDb);
    const { token } = await setupAdmin(app);
    const usersTable = (await import('../server/db/schema')).users;
    const boss = (await testDb.select().from(usersTable)).find(
      (u: { username: string }) => u.username === 'boss',
    );
    const [t1] = await testDb
      .insert(tenders)
      .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: boss.id })
      .returning();
    const edit = await request(app).patch(`/api/admin/tenders/${t1.id}`).set(auth(token)).send({ title: 'T1改' });
    expect(edit.status).toBe(200);
    expect(edit.body.tender.title).toBe('T1改');

    const [t2] = await testDb
      .insert(tenders)
      .values({ title: 'T2', deadline: new Date(Date.now() - 1000), createdBy: boss.id })
      .returning();
    const editPast = await request(app).patch(`/api/admin/tenders/${t2.id}`).set(auth(token)).send({ title: 'x' });
    expect(editPast.status).toBe(409);
  });

  it('提前关闭后状态为 closed，重复关闭 409', async () => {
    const app = createApp(testDb);
    const { token } = await setupAdmin(app);
    const usersTable = (await import('../server/db/schema')).users;
    const boss = (await testDb.select().from(usersTable)).find(
      (u: { username: string }) => u.username === 'boss',
    );
    const [t1] = await testDb
      .insert(tenders)
      .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: boss.id })
      .returning();
    const close = await request(app).post(`/api/admin/tenders/${t1.id}/close`).set(auth(token));
    expect(close.status).toBe(200);
    expect(close.body.tender.status).toBe('closed');
    const again = await request(app).post(`/api/admin/tenders/${t1.id}/close`).set(auth(token));
    expect(again.status).toBe(409);
  });

  it('不存在的招标返回 404', async () => {
    const app = createApp(testDb);
    const { token } = await setupAdmin(app);
    const res = await request(app).get('/api/admin/tenders/00000000-0000-0000-0000-000000000000').set(auth(token));
    expect(res.status).toBe(404);
  });
});
```

（测试里 `usersTable` 动态 import 写法冗余，直接顶部 `import { tenders, quotes, users } from '../server/db/schema'`，用 `users` 变量替换 `usersTable`。）

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/admin-tenders.test.ts`
Expected: FAIL — 404。

- [ ] **Step 4: 实现**（`server/routes/admin.ts` 在 users 路由后追加）:

```ts
import { and, desc, eq, sql } from 'drizzle-orm';
import { tenders, quotes } from '../db/schema';
import { currentUser } from '../auth/middleware';
import { computeRanks } from '../services/ranking';

const tenderBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullish(),
  deadline: z.string().datetime({ offset: true }),
});

export function adminRouter(db: Db) {
  // ...（users 部分保持不变）

  r.get('/tenders', async (_req, res) => {
    const rows = await db
      .select({
        id: tenders.id,
        title: tenders.title,
        description: tenders.description,
        deadline: tenders.deadline,
        status: tenders.status,
        createdAt: tenders.createdAt,
        quoteCount: sql<number>`count(${quotes.id})::int`,
      })
      .from(tenders)
      .leftJoin(quotes, eq(quotes.tenderId, tenders.id))
      .groupBy(tenders.id)
      .orderBy(desc(tenders.createdAt));
    res.json({ tenders: rows });
  });

  r.post('/tenders', async (req, res) => {
    const parsed = tenderBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });
    const deadline = new Date(parsed.data.deadline);
    if (deadline.getTime() <= Date.now()) return res.status(422).json({ error: '截止时间必须晚于当前时间' });
    const [t] = await db
      .insert(tenders)
      .values({
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        deadline,
        createdBy: currentUser(req).id,
      })
      .returning();
    return res.status(201).json({ tender: t });
  });

  r.get('/tenders/:id', async (req, res) => {
    const [t] = await db.select().from(tenders).where(eq(tenders.id, req.params.id));
    if (!t) return res.status(404).json({ error: '招标不存在' });
    const rows = await db
      .select({
        id: quotes.id,
        supplierId: quotes.supplierId,
        amount: quotes.amount,
        note: quotes.note,
        createdAt: quotes.createdAt,
        updatedAt: quotes.updatedAt,
        companyName: users.companyName,
      })
      .from(quotes)
      .innerJoin(users, eq(users.id, quotes.supplierId))
      .where(eq(quotes.tenderId, t.id));
    const ranks = computeRanks(rows);
    const board = rows
      .map((q) => ({ ...q, rank: ranks.get(q.supplierId)! }))
      .sort((a, b) => a.rank - b.rank);
    return res.json({ tender: t, quotes: board });
  });

  r.patch('/tenders/:id', async (req, res) => {
    const [t] = await db.select().from(tenders).where(eq(tenders.id, req.params.id));
    if (!t) return res.status(404).json({ error: '招标不存在' });
    if (t.status === 'closed' || t.deadline.getTime() <= Date.now()) {
      return res.status(409).json({ error: '招标已截止或已关闭，不可编辑' });
    }
    const parsed = tenderBodySchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });
    const values: Partial<typeof tenders.$inferInsert> = {};
    if (parsed.data.title !== undefined) values.title = parsed.data.title;
    if (parsed.data.description !== undefined) values.description = parsed.data.description ?? null;
    if (parsed.data.deadline !== undefined) {
      const d = new Date(parsed.data.deadline);
      if (d.getTime() <= Date.now()) return res.status(422).json({ error: '截止时间必须晚于当前时间' });
      values.deadline = d;
    }
    const [updated] = await db.update(tenders).set(values).where(eq(tenders.id, t.id)).returning();
    return res.json({ tender: updated });
  });

  r.post('/tenders/:id/close', async (req, res) => {
    const [t] = await db.select().from(tenders).where(eq(tenders.id, req.params.id));
    if (!t) return res.status(404).json({ error: '招标不存在' });
    if (t.status === 'closed') return res.status(409).json({ error: '招标已关闭' });
    const [updated] = await db
      .update(tenders)
      .set({ status: 'closed' })
      .where(and(eq(tenders.id, t.id), eq(tenders.status, 'open')))
      .returning();
    return res.json({ tender: updated });
  });
}
```

注意：`tenderBodySchema` 与 zod 导入放在文件顶部，`computeRanks`/`tenders`/`quotes`/`sql` 等合并进已有 import。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/admin-tenders.test.ts`
Expected: 6 passed。

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 6: Commit**

```bash
git add server/routes/admin.ts server/services/ranking.ts tests/admin-tenders.test.ts
git commit -m "feat: 管理员招标管理 + 完整报价榜"
```

---

### Task 10: 供应商-招标列表/详情（TDD）

**Files:**
- Modify: `server/routes/supplier.ts`（替换空壳）
- Create: `tests/supplier-tenders.test.ts`

- [ ] **Step 1: 写失败测试** `tests/supplier-tenders.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';
import { tenders, quotes, users } from '../server/db/schema';

async function setup() {
  const app = createApp(testDb);
  await insertUser(testDb, { username: 'boss', role: 'admin' });
  const boss = (await testDb.select().from(users)).find((u: { username: string }) => u.username === 'boss')!;
  const sup = await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
  const token = await loginToken(app, 'sup1', 'Passw0rd!123');
  return { app, boss, sup: sup.user, token };
}

describe('供应商-招标列表与详情', () => {
  it('列表返回开放与已截止的招标（含状态与我的报价摘要），不含他人信息', async () => {
    const { app, boss, sup, token } = await setup();
    const other = await insertUser(testDb, { username: 'sup2', companyName: '乙公司' });
    const [open] = await testDb
      .insert(tenders)
      .values({ title: '开放招标', deadline: new Date(Date.now() + 86400_000), createdBy: boss.id })
      .returning();
    const [past] = await testDb
      .insert(tenders)
      .values({ title: '已截止', deadline: new Date(Date.now() - 1000), createdBy: boss.id })
      .returning();
    // 他人已报 open 招标 50 元；我在 open 招标报 80 元
    const t0 = new Date('2026-09-17T08:00:00Z');
    await testDb.insert(quotes).values([
      { tenderId: open.id, supplierId: other.user.id, amount: '50.00', createdAt: t0, updatedAt: t0 },
      { tenderId: open.id, supplierId: sup.id, amount: '80.00', createdAt: new Date(t0.getTime() + 5000), updatedAt: new Date(t0.getTime() + 5000) },
    ]);
    const res = await request(app).get('/api/tenders').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.tenders).toHaveLength(2);
    const openRow = res.body.tenders.find((t: { id: string }) => t.id === open.id);
    expect(openRow).toMatchObject({ title: '开放招标', myAmount: '80.00', myRank: 2, totalParticipants: 2, hasQuote: true });
    const pastRow = res.body.tenders.find((t: { id: string }) => t.id === past.id);
    expect(pastRow.effectiveClosed).toBe(true);
    expect(pastRow.hasQuote).toBe(false);
  });

  it('详情返回招标信息 + 我的报价 + 我的名次，绝不返回他人报价', async () => {
    const { app, boss, sup, token } = await setup();
    const other = await insertUser(testDb, { username: 'sup2', companyName: '乙公司' });
    const [t1] = await testDb
      .insert(tenders)
      .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: boss.id })
      .returning();
    const t0 = new Date('2026-09-17T08:00:00Z');
    await testDb.insert(quotes).values([
      { tenderId: t1.id, supplierId: other.user.id, amount: '50.00', createdAt: t0, updatedAt: t0 },
      { tenderId: t1.id, supplierId: sup.id, amount: '80.00', createdAt: new Date(t0.getTime() + 5000), updatedAt: new Date(t0.getTime() + 5000) },
    ]);
    const res = await request(app).get(`/api/tenders/${t1.id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.tender.title).toBe('T1');
    expect(res.body.myQuote).toMatchObject({ amount: '80.00', rank: 2 });
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('50.00');
    expect(body).not.toContain('乙公司');
  });

  it('未报价时 myQuote 为 null', async () => {
    const { app, boss, token } = await setup();
    const [t1] = await testDb
      .insert(tenders)
      .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: boss.id })
      .returning();
    const res = await request(app).get(`/api/tenders/${t1.id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.myQuote).toBeNull();
    expect(res.body.totalParticipants).toBe(0);
  });

  it('不存在的招标返回 404', async () => {
    const { app, token } = await setup();
    const res = await request(app).get('/api/tenders/00000000-0000-0000-0000-000000000000').set(auth(token));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/supplier-tenders.test.ts`
Expected: FAIL — supplier 路由为空壳。

- [ ] **Step 3: 实现** `server/routes/supplier.ts`（替换全部）:

```ts
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { tenders, quotes } from '../db/schema';
import { currentUser } from '../auth/middleware';
import { computeRanks } from '../services/ranking';
import { upsertQuote } from '../services/quotes';
import type { Db } from '../db/client';

export function supplierRouter(db: Db) {
  const r = Router();

  r.get('/tenders', async (req, res) => {
    const me = currentUser(req);
    const rows = await db
      .select({
        id: tenders.id,
        title: tenders.title,
        description: tenders.description,
        deadline: tenders.deadline,
        status: tenders.status,
        createdAt: tenders.createdAt,
        myAmount: quotes.amount,
        myQuoteUpdatedAt: quotes.updatedAt,
      })
      .from(tenders)
      .leftJoin(quotes, and(eq(quotes.tenderId, tenders.id), eq(quotes.supplierId, me.id)))
      .orderBy(desc(tenders.createdAt));
    // 名次计算需要全部报价
    const allQuotes = await db
      .select({
        tenderId: quotes.tenderId,
        supplierId: quotes.supplierId,
        amount: quotes.amount,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .orderBy(quotes.amount, quotes.createdAt);
    const now = Date.now();
    const result = rows.map((t) => {
      const peers = allQuotes.filter((q) => q.tenderId === t.id);
      const ranks = computeRanks(peers);
      return {
        ...t,
        hasQuote: t.myAmount != null,
        effectiveClosed: t.status === 'closed' || t.deadline.getTime() <= now,
        myRank: t.myAmount != null ? ranks.get(me.id) ?? null : null,
        totalParticipants: peers.length,
      };
    });
    res.json({ tenders: result });
  });

  r.get('/tenders/:id', async (req, res) => {
    const me = currentUser(req);
    const [t] = await db.select().from(tenders).where(eq(tenders.id, req.params.id));
    if (!t) return res.status(404).json({ error: '招标不存在' });
    const [myQuote] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.tenderId, t.id), eq(quotes.supplierId, me.id)));
    const peers = await db
      .select({ supplierId: quotes.supplierId, amount: quotes.amount, createdAt: quotes.createdAt })
      .from(quotes)
      .where(eq(quotes.tenderId, t.id));
    const ranks = computeRanks(peers);
    res.json({
      tender: t,
      myQuote: myQuote
        ? { ...myQuote, rank: ranks.get(me.id) ?? null }
        : null,
      totalParticipants: peers.length,
      effectiveClosed: t.status === 'closed' || t.deadline.getTime() <= Date.now(),
    });
  });

  return r;
}
```

注意：`upsertQuote` 的 import 在 Task 11 才创建——本 Task 先不写这行 import（Task 11 再加）。上面代码块中的 `import { upsertQuote }` 行暂缓。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/supplier-tenders.test.ts`
Expected: 4 passed。

- [ ] **Step 5: Commit**

```bash
git add server/routes/supplier.ts tests/supplier-tenders.test.ts
git commit -m "feat: 供应商招标列表/详情（含我的名次摘要）"
```

---

### Task 11: 报价 upsert + 截止锁定（TDD，核心规则）

**Files:**
- Create: `server/services/quotes.ts`, `tests/quote-upsert.test.ts`
- Modify: `server/routes/supplier.ts`（追加 quote 路由）

- [ ] **Step 1: 写失败测试** `tests/quote-upsert.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';
import { tenders, quotes, users } from '../server/db/schema';

async function setup() {
  const app = createApp(testDb);
  await insertUser(testDb, { username: 'boss', role: 'admin' });
  const boss = (await testDb.select().from(users)).find((u: { username: string }) => u.username === 'boss')!;
  const sup = await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
  const token = await loginToken(app, 'sup1', 'Passw0rd!123');
  const [open] = await testDb
    .insert(tenders)
    .values({ title: '开放', deadline: new Date(Date.now() + 86400_000), createdBy: boss.id })
    .returning();
  const [closed] = await testDb
    .insert(tenders)
    .values({ title: '已关闭', status: 'closed', deadline: new Date(Date.now() + 86400_000), createdBy: boss.id })
    .returning();
  const [past] = await testDb
    .insert(tenders)
    .values({ title: '已过期', deadline: new Date(Date.now() - 1000), createdBy: boss.id })
    .returning();
  return { app, boss, sup: sup.user, token, open, closed, past };
}

describe('报价 upsert 与截止锁定', () => {
  it('首次提交成功，金额两位小数', async () => {
    const { app, open, token } = await setup();
    const res = await request(app)
      .put(`/api/tenders/${open.id}/quote`)
      .set(auth(token))
      .send({ amount: '1234.50', note: '含运费' });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);
  });

  it('非法金额返回 422（负数、三位小数、非数字）', async () => {
    const { app, open, token } = await setup();
    for (const amount of ['-1', '1.234', 'abc', '']) {
      const res = await request(app).put(`/api/tenders/${open.id}/quote`).set(auth(token)).send({ amount });
      expect(res.status).toBe(422);
    }
  });

  it('重复提交为原地更新（一条记录），created_at 不变', async () => {
    const { app, sup, open, token } = await setup();
    await request(app).put(`/api/tenders/${open.id}/quote`).set(auth(token)).send({ amount: '100.00' });
    const [first] = await testDb.select().from(quotes).where(eq(quotes.tenderId, open.id));
    expect(first.createdAt.getTime()).toBeGreaterThan(0);
    const res = await request(app)
      .put(`/api/tenders/${open.id}/quote`)
      .set(auth(token))
      .send({ amount: '90.00', note: '改价' });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    const all = await testDb.select().from(quotes).where(eq(quotes.tenderId, open.id));
    expect(all).toHaveLength(1);
    expect(all[0].amount).toBe('90.00');
    expect(all[0].createdAt.getTime()).toBe(first.createdAt.getTime()); // 首提时间不刷新
  });

  it('已关闭的招标返回 409', async () => {
    const { app, closed, token } = await setup();
    const res = await request(app).put(`/api/tenders/${closed.id}/quote`).set(auth(token)).send({ amount: '100.00' });
    expect(res.status).toBe(409);
  });

  it('已过截止时间的招标返回 409（以服务器时间为准）', async () => {
    const { app, past, token } = await setup();
    const res = await request(app).put(`/api/tenders/${past.id}/quote`).set(auth(token)).send({ amount: '100.00' });
    expect(res.status).toBe(409);
  });

  it('截止后 GET 自己的报价仍可见（只读）', async () => {
    const { app, sup, past, token } = await setup();
    const t0 = new Date('2026-09-17T08:00:00Z');
    await testDb.insert(quotes).values({ tenderId: past.id, supplierId: sup.id, amount: '88.00', createdAt: t0, updatedAt: t0 });
    const res = await request(app).get(`/api/tenders/${past.id}/quote`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.quote.amount).toBe('88.00');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/quote-upsert.test.ts`
Expected: FAIL — 404 / 模块不存在。

- [ ] **Step 3: 实现服务** `server/services/quotes.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { tenders, quotes } from '../db/schema';
import type { Db } from '../db/client';

export type UpsertResult =
  | { ok: true; created: boolean }
  | { ok: false; code: 404 | 409; error: string };

/**
 * 截止锁定核心：事务内 SELECT ... FOR UPDATE 锁定招标行，
 * 以数据库当前时间判断截止，再 upsert 报价。
 * created_at 仅在首次插入时生成（名次平局判定依据），更新时永不修改。
 */
export async function upsertQuote(
  db: Db,
  tenderId: string,
  supplierId: string,
  amount: string,
  note: string | null,
): Promise<UpsertResult> {
  return db.transaction(async (tx) => {
    const [tender] = await tx
      .select({ id: tenders.id, status: tenders.status, deadline: tenders.deadline })
      .from(tenders)
      .where(eq(tenders.id, tenderId))
      .for('update');
    if (!tender) return { ok: false, code: 404, error: '招标不存在' };
    if (tender.status === 'closed' || tender.deadline.getTime() <= Date.now()) {
      return { ok: false, code: 409, error: '报价已截止，无法修改' };
    }
    const [existing] = await tx
      .select({ id: quotes.id })
      .from(quotes)
      .where(and(eq(quotes.tenderId, tenderId), eq(quotes.supplierId, supplierId)));
    const now = new Date();
    if (existing) {
      await tx
        .update(quotes)
        .set({ amount, note, updatedAt: now })
        .where(eq(quotes.id, existing.id));
      return { ok: true, created: false };
    }
    await tx.insert(quotes).values({ tenderId, supplierId, amount, note });
    return { ok: true, created: true };
  });
}
```

- [ ] **Step 4: 实现路由**（`server/routes/supplier.ts` 追加，并加 `import { upsertQuote } from '../services/quotes'`）:

```ts
  const quoteBodySchema = z.object({
    amount: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,2})?$/, '金额必须是非负数字，最多两位小数'),
    note: z.string().max(2000).nullish(),
  });

  r.get('/tenders/:id/quote', async (req, res) => {
    const me = currentUser(req);
    const [q] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.tenderId, req.params.id), eq(quotes.supplierId, me.id)));
    res.json({ quote: q ?? null });
  });

  r.put('/tenders/:id/quote', async (req, res) => {
    const me = currentUser(req);
    const parsed = quoteBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });
    const result = await upsertQuote(db, req.params.id, me.id, parsed.data.amount, parsed.data.note ?? null);
    if (!result.ok) return res.status(result.code).json({ error: result.error });
    return res.json({ created: result.created });
  });
```

顶部追加 `import { z } from 'zod';`。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/quote-upsert.test.ts`
Expected: 6 passed。

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 6: Commit**

```bash
git add server/services/quotes.ts server/routes/supplier.ts tests/quote-upsert.test.ts
git commit -m "feat: 报价 upsert + 事务级截止锁定"
```

---

### Task 12: 名次接口（TDD，核心规则）

**Files:**
- Modify: `server/routes/supplier.ts`（追加 ranking 路由）
- Create: `tests/ranking.test.ts`

- [ ] **Step 1: 写失败测试** `tests/ranking.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';
import { tenders, quotes, users } from '../server/db/schema';

async function setup() {
  const app = createApp(testDb);
  await insertUser(testDb, { username: 'boss', role: 'admin' });
  const boss = (await testDb.select().from(users)).find((u: { username: string }) => u.username === 'boss')!;
  const [t1] = await testDb
    .insert(tenders)
    .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: boss.id })
    .returning();
  return { app, boss, t1 };
}

async function loginAs(app: ReturnType<typeof createApp>, username: string) {
  return loginToken(app, username, 'Passw0rd!123');
}

describe('名次规则', () => {
  it('金额低者名次靠前；同价先提交者靠前', async () => {
    const { app, t1 } = await setup();
    const a = await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    const b = await insertUser(testDb, { username: 'sup_b', companyName: '乙' });
    const c = await insertUser(testDb, { username: 'sup_c', companyName: '丙' });
    const t0 = new Date('2026-09-17T08:00:00Z');
    // b: 100 元 t0；c: 100 元 t0+1h（同价，b 先）→ b1 c2；a: 80 元 → a 第 1
    await testDb.insert(quotes).values([
      { tenderId: t1.id, supplierId: b.user.id, amount: '100.00', createdAt: t0, updatedAt: t0 },
      { tenderId: t1.id, supplierId: c.user.id, amount: '100.00', createdAt: new Date(t0.getTime() + 3600_000), updatedAt: new Date(t0.getTime() + 3600_000) },
      { tenderId: t1.id, supplierId: a.user.id, amount: '80.00', createdAt: new Date(t0.getTime() + 7200_000), updatedAt: new Date(t0.getTime() + 7200_000) },
    ]);
    const tokenA = await loginAs(app, 'sup_a');
    const resA = await request(app).get(`/api/tenders/${t1.id}/ranking`).set(auth(tokenA));
    expect(resA.status).toBe(200);
    expect(resA.body).toEqual({ rank: 1, total: 3 });
    const tokenB = await loginAs(app, 'sup_b');
    const resB = await request(app).get(`/api/tenders/${t1.id}/ranking`).set(auth(tokenB));
    expect(resB.body).toEqual({ rank: 2, total: 3 });
  });

  it('修改报价不改名次依据（首提时间早者仍领先）', async () => {
    const { app, t1 } = await setup();
    const a = await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    const b = await insertUser(testDb, { username: 'sup_b', companyName: '乙' });
    const t0 = new Date('2026-09-17T08:00:00Z');
    await testDb.insert(quotes).values([
      { tenderId: t1.id, supplierId: a.user.id, amount: '100.00', createdAt: t0, updatedAt: t0 },
      { tenderId: t1.id, supplierId: b.user.id, amount: '100.00', createdAt: new Date(t0.getTime() + 1000), updatedAt: new Date(t0.getTime() + 1000) },
    ]);
    const tokenB = await loginAs(app, 'sup_b');
    // b 改成 100.00（同价重存）→ b 仍第 2（createdAt 未刷新）
    await request(app).put(`/api/tenders/${t1.id}/quote`).set(auth(tokenB)).send({ amount: '100.00' });
    const res = await request(app).get(`/api/tenders/${t1.id}/ranking`).set(auth(tokenB));
    expect(res.body).toEqual({ rank: 2, total: 2 });
  });

  it('未报价时 rank 为 null', async () => {
    const { app, t1 } = await setup();
    await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    await testDb.insert(quotes).values({
      tenderId: t1.id,
      supplierId: (await testDb.select().from(users)).find((u: { username: string }) => u.username === 'sup_a')!.id,
      amount: '100.00',
    });
    const outsider = await insertUser(testDb, { username: 'sup_x', companyName: '外部' });
    const tokenX = await loginAs(app, 'sup_x');
    const res = await request(app).get(`/api/tenders/${t1.id}/ranking`).set(auth(tokenX));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rank: null, total: 1 });
  });

  it('响应只含 rank 和 total，不泄露任何金额/公司名', async () => {
    const { app, t1 } = await setup();
    const a = await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    await testDb.insert(quotes).values({ tenderId: t1.id, supplierId: a.user.id, amount: '777.77' });
    const outsider = await insertUser(testDb, { username: 'sup_x', companyName: '外部' });
    const tokenX = await loginAs(app, 'sup_x');
    const res = await request(app).get(`/api/tenders/${t1.id}/ranking`).set(auth(tokenX));
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('777.77');
    expect(body).not.toContain('甲');
    expect(Object.keys(res.body).sort()).toEqual(['rank', 'total']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ranking.test.ts`
Expected: FAIL — ranking 路由 404。

- [ ] **Step 3: 实现**（`server/routes/supplier.ts` 追加）:

```ts
  r.get('/tenders/:id/ranking', async (req, res) => {
    const me = currentUser(req);
    const [t] = await db.select({ id: tenders.id }).from(tenders).where(eq(tenders.id, req.params.id));
    if (!t) return res.status(404).json({ error: '招标不存在' });
    const peers = await db
      .select({ supplierId: quotes.supplierId, amount: quotes.amount, createdAt: quotes.createdAt })
      .from(quotes)
      .where(eq(quotes.tenderId, t.id));
    const ranks = computeRanks(peers);
    const myRank = ranks.get(me.id) ?? null;
    return res.json({ rank: myRank, total: peers.length });
  });
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/ranking.test.ts`
Expected: 4 passed。

Run: `npm test`
Expected: 全部通过（回归）。

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add server/routes/supplier.ts tests/ranking.test.ts
git commit -m "feat: 供应商名次接口（rank/total，隔离他人数据）"
```

---

### Task 13: 服务器入口 + 全量回归 + 手动 smoke

**Files:**
- Create: `server/index.ts`

- [ ] **Step 1: 写入口** `server/index.ts`:

```ts
import 'dotenv/config';
import { createApp } from './app';
import { closeDb } from './db/client';
import { runMigrations } from './db/migrate';
import { seedAdmin } from './seed';
import { db } from './db/client';

const port = Number(process.env.PORT ?? 3000);

async function main() {
  await runMigrations();
  await seedAdmin(db);
  const app = createApp(db);
  app.listen(port, () => {
    console.log(`supplier-quote 已启动: http://0.0.0.0:${port}`);
  });
}

main().catch(async (err) => {
  console.error('启动失败:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
```

- [ ] **Step 2: 全量测试 + 类型检查**

Run: `npm test && npm run typecheck`
Expected: 全部通过。

- [ ] **Step 3: 本机手动 smoke**

Run（后台起 dev 服务器）: `npm run dev:server`（另开终端或 run_in_background）
Run: `curl -s http://localhost:3000/api/health`
Expected: `{"ok":true}`

Run: `curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"<.env 里的 ADMIN_PASSWORD>"}' | head -c 200`
Expected: 返回含 `"token"` 与 `"role":"admin"` 的 JSON（seed 生效）。

验证后停掉 dev 服务器。

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: 服务器启动入口（migrate → seed → listen）"
```

---

### Task 14: 前端基建：api 客户端 + 认证上下文 + 路由 + 登录页

**Files:**
- Create: `src/lib/utils.ts`, `src/api.ts`, `src/auth-context.tsx`, `src/use-polling.ts`, `src/pages/LoginPage.tsx`
- Modify: `src/App.tsx`（路由骨架）

- [ ] **Step 1: 写 utils 与 api 客户端**

`src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleString('zh-CN', { hour12: false });
}

export function isClosed(status: string, deadline: string | Date): boolean {
  return status === 'closed' || new Date(deadline).getTime() <= Date.now();
}
```

（clsx 与 tailwind-merge 需安装：`npm install clsx tailwind-merge`）

`src/api.ts`:

```ts
const TOKEN_KEY = 'sq_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401) clearToken();
  if (!res.ok) throw new ApiError(res.status, (data.error as string) ?? `请求失败 (${res.status})`);
  return data as T;
}
```

- [ ] **Step 2: 写认证上下文** `src/auth-context.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, setToken } from './api';

export interface CurrentUser {
  id: string;
  username: string;
  role: 'admin' | 'supplier';
  companyName: string | null;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<CurrentUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<{ user: CurrentUser }>('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const value: AuthState = {
    user,
    loading,
    async login(username, password) {
      const d = await api<{ token: string; user: CurrentUser }>('/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      setToken(d.token);
      setUser(d.user);
      return d.user;
    },
    logout() {
      clearToken();
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

`src/use-polling.ts`:

```ts
import { useEffect, useRef, useState } from 'react';

/** 每 intervalMs 轮询一次 fetcher；返回最新数据。fetcher 需稳定（用 useCallback）。 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fetcher);
  fnRef.current = fetcher;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const d = await fnRef.current();
        if (alive) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : '加载失败');
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { data, error };
}
```

- [ ] **Step 3: 写登录页** `src/pages/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(username, password);
      navigate(user.role === 'admin' ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-[380px]">
        <CardHeader>
          <CardTitle>供应商报价系统</CardTitle>
          <CardDescription>请使用管理员或供应商账号登录</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">用户名</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? '登录中…' : '登录'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: 路由骨架** `src/App.tsx`（替换全部；页面文件先建占位）:

先建占位页面（每个文件同样模式，后续 Task 替换）：`src/pages/SupplierTendersPage.tsx`、`src/pages/SupplierTenderDetailPage.tsx`、`src/pages/AdminTendersPage.tsx`、`src/pages/AdminTenderNewPage.tsx`、`src/pages/AdminTenderDetailPage.tsx`、`src/pages/AdminUsersPage.tsx`:

```tsx
export default function SupplierTendersPage() {
  return <div>占位</div>;
}
```

（Admin 页面默认导出名同理。）

`src/App.tsx`:

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth-context';
import LoginPage from './pages/LoginPage';
import SupplierTendersPage from './pages/SupplierTendersPage';
import SupplierTenderDetailPage from './pages/SupplierTenderDetailPage';
import AdminTendersPage from './pages/AdminTendersPage';
import AdminTenderNewPage from './pages/AdminTenderNewPage';
import AdminTenderDetailPage from './pages/AdminTenderDetailPage';
import AdminUsersPage from './pages/AdminUsersPage';

function Protected({ role, children }: { role?: 'admin' | 'supplier'; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6 text-muted-foreground">加载中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Protected role="supplier">
              <SupplierTendersPage />
            </Protected>
          }
        />
        <Route
          path="/tenders/:id"
          element={
            <Protected role="supplier">
              <SupplierTenderDetailPage />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected role="admin">
              <AdminTendersPage />
            </Protected>
          }
        />
        <Route
          path="/admin/tenders/new"
          element={
            <Protected role="admin">
              <AdminTenderNewPage />
            </Protected>
          }
        />
        <Route
          path="/admin/tenders/:id"
          element={
            <Protected role="admin">
              <AdminTenderDetailPage />
            </Protected>
          }
        />
        <Route
          path="/admin/users"
          element={
            <Protected role="admin">
              <AdminUsersPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 5: 验证构建**

Run: `npm run typecheck && npm run build`
Expected: 通过。（此刻 `@/components/ui/*` 还不存在，登录页 import 会报错——因此 Step 5 前先完成 Task 15 的组件，或本 Task 将 LoginPage 中 UI 组件改为原生元素、Task 15 完成后再换回。**推荐顺序：先做 Task 15 再回做本 Step。** 若按序执行，本 Task 的 Step 3-5 推迟到 Task 15 之后。）

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: 前端基建（api 客户端/认证上下文/轮询/路由/登录页）"
```

---

### Task 15: shadcn 风格 UI 组件（手写，不依赖 CLI）

**Files:**
- Create: `src/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, `card.tsx`, `table.tsx`, `badge.tsx`

- [ ] **Step 1: 写组件**

`src/components/ui/button.tsx`:

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-input bg-card hover:bg-muted',
        ghost: 'hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
```

（需安装：`npm install class-variance-authority`）

`src/components/ui/input.tsx`:

```tsx
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
```

`src/components/ui/label.tsx`:

```tsx
import type { LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium', className)} {...props} />;
}
```

`src/components/ui/textarea.tsx`:

```tsx
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[60px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
```

`src/components/ui/card.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border bg-card shadow-sm', className)} {...props} />;
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />;
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold', className)} {...props} />;
}
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />;
}
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />;
}
```

`src/components/ui/table.tsx`:

```tsx
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />;
}
export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}
export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b transition-colors hover:bg-muted/50', className)} {...props} />;
}
export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-9 px-2 text-left align-middle text-xs font-medium text-muted-foreground', className)} {...props} />;
}
export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-2 py-1.5 align-middle', className)} {...props} />;
}
```

`src/components/ui/badge.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-muted text-muted-foreground',
        outline: 'border border-input text-foreground',
        success: 'bg-green-100 text-green-800',
        destructive: 'bg-red-100 text-red-800',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

- [ ] **Step 2: 安装缺失依赖并验证**

Run: `npm install clsx tailwind-merge class-variance-authority`
Run: `npm run typecheck && npm run build`
Expected: 通过（含 Task 14 的登录页与路由）。

- [ ] **Step 3: 手动验证登录页**

Run: `npm run dev:web`（另开 `npm run dev:server`）
浏览器打开 `http://localhost:5173`：能看到登录卡片，登录后按角色跳转（占位页）。验证后停掉。

- [ ] **Step 4: Commit**

```bash
git add src/components/ package.json package-lock.json
git commit -m "feat: shadcn 风格 UI 组件（button/input/label/textarea/card/table/badge）"
```

---

### Task 16: 供应商页面（列表 + 详情/报价/名次轮询）

**Files:**
- Modify: `src/pages/SupplierTendersPage.tsx`, `src/pages/SupplierTenderDetailPage.tsx`（替换占位）

- [ ] **Step 1: 供应商招标列表** `src/pages/SupplierTendersPage.tsx`（替换全部）:

```tsx
import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth-context';
import { usePolling } from '../use-polling';
import { formatDateTime, isClosed } from '../lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface TenderRow {
  id: string;
  title: string;
  deadline: string;
  status: string;
  hasQuote: boolean;
  effectiveClosed: boolean;
  myAmount: string | null;
  myRank: number | null;
  totalParticipants: number;
}

export default function SupplierTendersPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data } = usePolling<{ tenders: TenderRow[] }>(
    useCallback(() => api('/tenders'), []),
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">招标列表</h1>
          <p className="text-xs text-muted-foreground">{user?.companyName ?? user?.username}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { logout(); navigate('/login'); }}>
          退出登录
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>全部招标</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>截止时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>我的报价</TableHead>
                <TableHead>我的名次</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.tenders ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(t.deadline)}</TableCell>
                  <TableCell>
                    {t.effectiveClosed ? (
                      <Badge variant="secondary">已截止</Badge>
                    ) : (
                      <Badge>报价中</Badge>
                    )}
                  </TableCell>
                  <TableCell>{t.myAmount ? `¥${t.myAmount}` : <span className="text-muted-foreground">未报价</span>}</TableCell>
                  <TableCell>
                    {t.myRank ? (
                      <Badge variant={t.myRank === 1 ? 'success' : 'outline'}>
                        第 {t.myRank} 名 / 共 {t.totalParticipants} 家
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild={undefined}>
                      <Link to={`/tenders/${t.id}`}>进入</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data && data.tenders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    暂无招标
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

注意：Button 不支持 asChild（无 radix slot）——把 Link 直接当按钮样式用，改为：

```tsx
<Link
  to={`/tenders/${t.id}`}
  className="inline-flex h-8 items-center rounded-md border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
>
  进入
</Link>
```

（删掉 `import { Button }` 若不再使用；页面头部退出按钮仍用 Button。）

- [ ] **Step 2: 供应商招标详情** `src/pages/SupplierTenderDetailPage.tsx`（替换全部）:

```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { usePolling } from '../use-polling';
import { formatDateTime } from '../lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Detail {
  tender: { id: string; title: string; description: string | null; deadline: string; status: string };
  myQuote: { amount: string; note: string | null; createdAt: string; updatedAt: string; rank: number | null } | null;
  totalParticipants: number;
  effectiveClosed: boolean;
}

export default function SupplierTenderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(() => api<Detail>(`/tenders/${id}`), [id]);
  const { data } = usePolling(fetcher);
  useEffect(() => {
    if (data) {
      setDetail(data);
      if (!amount) setAmount(data.myQuote?.amount ?? '');
      if (!note) setNote(data.myQuote?.note ?? '');
    }
    // 仅在轮询数据首次到达时同步表单初值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const locked = detail?.effectiveClosed ?? false;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setError('');
    try {
      await api(`/tenders/${id}/quote`, { method: 'PUT', body: { amount, note: note || null } });
      setMsg('报价已保存');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return <div className="p-6 text-muted-foreground">加载中…</div>;

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link to="/" className="text-xs text-muted-foreground hover:underline">← 返回列表</Link>
        <h1 className="mt-1 text-2xl font-semibold">{detail.tender.title}</h1>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>截止：{formatDateTime(detail.tender.deadline)}</span>
          {locked ? <Badge variant="secondary">已截止</Badge> : <Badge>报价中</Badge>}
        </div>
      </div>

      {detail.tender.description && (
        <Card>
          <CardHeader>
            <CardTitle>招标说明</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{detail.tender.description}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>我的报价</CardTitle>
            <CardDescription>
              {locked
                ? '报价已截止，以下为最终报价，不可修改'
                : '截止时间前可多次修改报价，以最新一次保存为准'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="amount">报价金额（元）</Label>
                <Input
                  id="amount"
                  inputMode="decimal"
                  placeholder="例如 12800.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={locked || busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="note">备注（可选）</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={locked || busy}
                />
              </div>
              {msg && <p className="text-xs text-green-700">{msg}</p>}
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" disabled={locked || busy}>
                {detail.myQuote ? '修改报价' : '提交报价'}
              </Button>
            </form>
            {detail.myQuote && (
              <div className="mt-4 space-y-0.5 text-xs text-muted-foreground">
                <p>首次提交：{formatDateTime(detail.myQuote.createdAt)}</p>
                <p>最近更新：{formatDateTime(detail.myQuote.updatedAt)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>我的名次</CardTitle>
            <CardDescription>实时刷新（每 5 秒）· 名次按金额从低到高，同价先提交者优先</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-1 py-8">
            {detail.myQuote?.rank != null ? (
              <>
                <span className="text-4xl font-semibold text-primary">第 {detail.myQuote.rank} 名</span>
                <span className="text-xs text-muted-foreground">共 {detail.totalParticipants} 家参与</span>
              </>
            ) : detail.myQuote ? (
              <span className="text-sm text-muted-foreground">名次计算中…</span>
            ) : (
              <span className="text-sm text-muted-foreground">提交报价后显示名次</span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 手动验证**

启动 `npm run dev:server` + `npm run dev:web`，用管理员建一个供应商账号并创建招标后，用供应商登录走一遍：列表 → 详情 → 报价 → 改价 → 名次显示。确认他人数据不可见。

- [ ] **Step 4: Commit**

```bash
git add src/pages/
git commit -m "feat: 供应商页面（招标列表/详情/报价表单/名次轮询）"
```

---

### Task 17: 管理员页面（招标管理 + 报价榜 + 账号管理）

**Files:**
- Modify: `src/pages/AdminTendersPage.tsx`, `src/pages/AdminTenderNewPage.tsx`, `src/pages/AdminTenderDetailPage.tsx`, `src/pages/AdminUsersPage.tsx`（替换占位）

- [ ] **Step 1: 招标列表** `src/pages/AdminTendersPage.tsx`:

```tsx
import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth-context';
import { usePolling } from '../use-polling';
import { formatDateTime, isClosed } from '../lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface TenderRow {
  id: string;
  title: string;
  deadline: string;
  status: string;
  quoteCount: number;
}

export default function AdminTendersPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data } = usePolling<{ tenders: TenderRow[] }>(
    useCallback(() => api('/admin/tenders'), []),
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">招标管理</h1>
          <p className="text-xs text-muted-foreground">管理员：{user?.username}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/users')}>供应商账号</Button>
          <Button variant="outline" size="sm" onClick={() => { logout(); navigate('/login'); }}>退出登录</Button>
        </div>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>全部招标</CardTitle>
          <Link
            to="/admin/tenders/new"
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            + 发布招标
          </Link>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>截止时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>报价数</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.tenders ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(t.deadline)}</TableCell>
                  <TableCell>
                    {t.status === 'closed' ? (
                      <Badge variant="secondary">已关闭</Badge>
                    ) : isClosed(t.status, t.deadline) ? (
                      <Badge variant="secondary">已截止</Badge>
                    ) : (
                      <Badge>报价中</Badge>
                    )}
                  </TableCell>
                  <TableCell>{t.quoteCount}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      to={`/admin/tenders/${t.id}`}
                      className="inline-flex h-8 items-center rounded-md border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
                    >
                      查看
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {data && data.tenders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">暂无招标</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: 发布招标** `src/pages/AdminTenderNewPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminTenderNewPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState(toLocalInputValue(new Date(Date.now() + 3 * 86400_000)));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api<{ tender: { id: string } }>('/admin/tenders', {
        method: 'POST',
        body: { title, description: description || null, deadline: new Date(deadline).toISOString() },
      });
      navigate(`/admin/tenders/${d.tender.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <Link to="/admin" className="text-xs text-muted-foreground hover:underline">← 返回</Link>
        <h1 className="mt-1 text-2xl font-semibold">发布招标</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>招标信息</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">标题</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">招标说明（可选）</Label>
              <Textarea id="description" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deadline">报价截止时间</Label>
              <Input id="deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? '创建中…' : '创建招标'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: 招标详情（完整榜单 + 编辑 + 关闭）** `src/pages/AdminTenderDetailPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { usePolling } from '../use-polling';
import { formatDateTime, isClosed } from '../lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

interface BoardQuote {
  id: string;
  companyName: string | null;
  amount: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  rank: number;
}

interface AdminDetail {
  tender: { id: string; title: string; description: string | null; deadline: string; status: string };
  quotes: BoardQuote[];
}

export default function AdminTenderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const fetcher = useCallback(() => api<AdminDetail>(`/admin/tenders/${id}`), [id]);
  const { data } = usePolling(fetcher);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (data && !initialized) {
      setTitle(data.tender.title);
      setDescription(data.tender.description ?? '');
      setDeadline(data.tender.deadline.slice(0, 16));
      setInitialized(true);
    }
  }, [data, initialized]);

  if (!data) return <div className="p-6 text-muted-foreground">加载中…</div>;
  const t = data.tender;
  const locked = t.status === 'closed' || isClosed(t.status, t.deadline);

  async function saveEdit() {
    setMsg('');
    setError('');
    try {
      await api(`/admin/tenders/${id}`, {
        method: 'PATCH',
        body: {
          title,
          description: description || null,
          ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}),
        },
      });
      setMsg('已保存');
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    }
  }

  async function closeTender() {
    setError('');
    if (!confirm('确定提前关闭该招标？关闭后供应商无法再报价。')) return;
    try {
      await api(`/admin/tenders/${id}/close`, { method: 'POST' });
      setMsg('已关闭');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link to="/admin" className="text-xs text-muted-foreground hover:underline">← 返回</Link>
        <div className="mt-1 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{t.title}</h1>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>截止：{formatDateTime(t.deadline)}</span>
              {t.status === 'closed' ? <Badge variant="secondary">已关闭</Badge> : locked ? <Badge variant="secondary">已截止</Badge> : <Badge>报价中</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            {!locked && !editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>编辑</Button>
            )}
            {t.status !== 'closed' && (
              <Button variant="destructive" size="sm" onClick={closeTender}>提前关闭</Button>
            )}
          </div>
        </div>
        {msg && <p className="mt-2 text-xs text-green-700">{msg}</p>}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>

      {editing && (
        <Card>
          <CardHeader><CardTitle>编辑招标</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>标题</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>招标说明</Label>
              <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>截止时间</Label>
              <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit}>保存</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!editing && t.description && (
        <Card>
          <CardHeader><CardTitle>招标说明</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm">{t.description}</p></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>报价榜</CardTitle>
          <CardDescription>共 {data.quotes.length} 家参与 · 每家仅显示最新报价 · 同价先提交者优先</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">名次</TableHead>
                <TableHead>公司</TableHead>
                <TableHead>报价金额（元）</TableHead>
                <TableHead>首次提交</TableHead>
                <TableHead>最近更新</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.quotes.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <Badge variant={q.rank === 1 ? 'success' : 'outline'}>{q.rank}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{q.companyName ?? '-'}</TableCell>
                  <TableCell className="font-medium">¥{q.amount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(q.createdAt)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(q.updatedAt)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{q.note ?? '-'}</TableCell>
                </TableRow>
              ))}
              {data.quotes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">暂无报价</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: 供应商账号管理** `src/pages/AdminUsersPage.tsx`:

```tsx
import { useCallback, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { usePolling } from '../use-polling';
import { formatDateTime } from '../lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface SupplierRow {
  id: string;
  username: string;
  companyName: string | null;
  active: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const { data, setData } = usePollingWithSet<{ users: SupplierRow[] }>(
    useCallback(() => api('/admin/users'), []),
  );
  const [username, setUsername] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/users', { method: 'POST', body: { username, password, companyName } });
      setCreated({ username, password });
      setUsername('');
      setCompanyName('');
      setPassword('');
      const fresh = await api<{ users: SupplierRow[] }>('/admin/users');
      setData(fresh);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(u: SupplierRow) {
    const pwd = prompt(`为「${u.companyName ?? u.username}」设置新密码（至少 8 位）：`);
    if (!pwd) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { password: pwd } });
      alert('密码已重置');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  async function toggleActive(u: SupplierRow) {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
      const fresh = await api<{ users: SupplierRow[] }>('/admin/users');
      setData(fresh);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link to="/admin" className="text-xs text-muted-foreground hover:underline">← 返回</Link>
        <h1 className="mt-1 text-2xl font-semibold">供应商账号</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>新建供应商账号</CardTitle>
          <CardDescription>创建后请将用户名和初始密码告知供应商</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createUser} className="grid gap-4 md:grid-cols-4 md:items-end">
            <div className="space-y-1.5">
              <Label>用户名</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label>公司名称</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>初始密码（≥8 位）</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" disabled={busy}>创建</Button>
          </form>
          {created && (
            <p className="mt-3 rounded-md bg-muted p-3 text-xs">
              已创建 <b>{created.username}</b>，初始密码 <b>{created.password}</b> —— 请立即告知供应商并妥善保存。
            </p>
          )}
          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>账号列表</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>公司名称</TableHead>
                <TableHead>用户名</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.users ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.companyName}</TableCell>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.active ? <Badge variant="success">启用</Badge> : <Badge variant="secondary">停用</Badge>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(u.createdAt)}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => resetPassword(u)}>重置密码</Button>
                    <Button variant={u.active ? 'destructive' : 'outline'} size="sm" onClick={() => toggleActive(u)}>
                      {u.active ? '停用' : '启用'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

注意：上面用了 `usePollingWithSet`——`use-polling.ts` 没有 setData。两个选择：给 `usePolling` 增加 `refresh` 函数（更干净）。**改为在 `src/use-polling.ts` 的返回中增加 `reload`：**

```ts
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fetcher);
  fnRef.current = fetcher;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const d = await fnRef.current();
        if (alive) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : '加载失败');
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  const reload = useCallback(async () => {
    try {
      setData(await fnRef.current());
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    }
  }, []);

  return { data, error, reload };
}
```

（顶部 `import { useCallback, useEffect, useRef, useState } from 'react';`）页面中用 `const { data, reload } = usePolling(...)`，操作成功后调用 `reload()`，删除 `usePollingWithSet`。

- [ ] **Step 5: 全量验证**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通过。

Run: 手动 smoke（dev:server + dev:web）：管理员发布招标 → 建供应商 → 供应商报价 → 管理员榜单可见名次 → 提前关闭 → 供应商截止后表单禁用。

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: 管理员页面（招标管理/完整榜单/供应商账号管理）"
```

---

### Task 18: Docker 化（Dockerfile + compose）

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`

- [ ] **Step 1: 写 .dockerignore**

```
node_modules
dist
.git
.env
*.log
```

- [ ] **Step 2: 写 Dockerfile（多阶段）**

```dockerfile
# ---- build 阶段：安装全部依赖并构建前端 ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runner 阶段：仅生产依赖 + 构建产物 ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Shanghai
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/server ./server
EXPOSE 3000
CMD ["npx", "tsx", "server/index.ts"]
```

- [ ] **Step 3: 写 docker-compose.yml**

```yaml
services:
  app:
    build: .
    container_name: supplier-quote
    restart: unless-stopped
    ports:
      - "8090:3000"
    environment:
      # 通过 1panel-network 直连 postgres 容器（别名 postgresql），不经过宿主机防火墙
      DATABASE_URL: postgres://supplier_quote:${DB_PASSWORD}@postgresql:5432/supplier_quote
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_USERNAME: ${ADMIN_USERNAME:-admin}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      TZ: Asia/Shanghai
    networks: [1panel-network]

networks:
  1panel-network:
    external: true
```

- [ ] **Step 4: 写部署 .env（根目录，不入库）**

```
DB_PASSWORD=<Task 2 生成的 DB_PASS>
JWT_SECRET=<openssl rand -hex 24>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<首次启动管理员密码>
```

- [ ] **Step 5: 本机构建验证**

Run: `docker build -t supplier-quote:latest .`
Expected: 构建成功。

Run（验证镜像可启动并连上 postgres——用 1panel-network）:
```bash
docker run --rm --network 1panel-network \
  -e DATABASE_URL="postgres://supplier_quote:${DB_PASSWORD}@postgresql:5432/supplier_quote" \
  -e JWT_SECRET="dev-secret-dev-secret-dev-secret" \
  -e ADMIN_PASSWORD="smoketest123" \
  -p 3099:3000 supplier-quote:latest
```
Expected: 日志出现 `supplier-quote 已启动: http://0.0.0.0:3000`，无 migrate 报错。
另开终端: `curl -s http://localhost:3099/api/health` → `{"ok":true}`，随后 Ctrl+C 停止（--rm 自动清理）。

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: Docker 化（多阶段构建 + 1panel-network 直连 postgres）"
```

---

### Task 19: 正式部署上线

**Files:** 无新文件（部署操作）

- [ ] **Step 1: compose 启动**

Run: `docker compose up -d --build`
Expected: 容器 `supplier-quote` Up，`docker logs supplier-quote` 显示已启动 + 无错误。

- [ ] **Step 2: 冒烟验证（宿主机上）**

Run:
```bash
curl -s http://localhost:8090/api/health
curl -s -X POST http://localhost:8090/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}' | head -c 120
curl -s http://localhost:8090/ | head -c 120   # 应返回 index.html
```
Expected: health ok；登录返回 token；首页返回 HTML。

- [ ] **Step 3: 开放防火墙（用户手动，sudo 需输密码）**

```bash
sudo ufw allow 8090/tcp comment 'supplier-quote'
```

- [ ] **Step 4: 局域网访问验证**

浏览器打开 `http://172.18.9.55:8090`，用管理员登录，创建一个供应商账号，完成一轮「发布招标 → 供应商报价 → 榜单/名次 → 提前关闭」闭环验证。

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "chore: 部署配置收尾" --allow-empty
```

**部署注意（写给用户）:**
- 数据库已独立于其他业务（`supplier_quote` 库），备份随 postgres 现有策略。
- 升级：`cd /home/gdby/supplier-quote && git pull && docker compose up -d --build`（迁移在容器启动时自动执行）。
- 后续供应商要公网访问时：加 HTTPS 反代 + 更严格密码策略，接入方式确定后再议。

---

## Self-Review 结论

1. **Spec 覆盖**：认证（Task 3/4/6/7）、账号管理（Task 8）、招标管理（Task 9）、供应商列表/详情（Task 10）、报价与截止锁定（Task 11）、名次规则含平局判定（Task 12）、静态托管/SPA（Task 5/13）、设计规范 tokens（Task 1 index.css + Task 15 组件）、Docker/部署（Task 18/19）、数据隔离与「不暴露他人数据」由 Task 10/12 测试显式验证——均已覆盖。
2. **占位符扫描**：无 TBD/TODO；所有步骤含完整代码或精确命令。
3. **类型一致性**：`Db` 类型贯穿（client.ts 定义，路由工厂参数）；`computeRanks` 签名在 Task 9 定义、Task 10/12 复用一致；`usePolling` 返回 `{data, error, reload}`（Task 14 定义，Task 16/17 使用一致）；金额全程字符串（`numeric` → string，zod regex 校验）规避浮点。
4. **已知执行顺序约束**：Task 14 的 Step 3-5 依赖 Task 15 的 UI 组件——执行时若按序进行，Task 14 先提交 Step 1-2（含占位页），Task 15 完成后再补登录页并验证。
