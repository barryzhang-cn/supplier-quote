# Supplier Quote

供应商报价管理系统。公司采购方发布招标邀请，供应商在线报价并实时查看名次。

> 内网部署 · 单 Docker 容器 · 复用现有 PostgreSQL

---

## 特性

- 双角色：管理员（采购方）+ 供应商
- 招标全生命周期：发布、编辑、提前关闭、截止自动锁定
- 实时名次：金额低者靠前，同价按提交时间排序；首次提交时间不刷新（防后改者插队）
- 邀请名单：管理员按供应商筛选，未邀请者对招标完全不可见
- 服务端强制的两层隔离：报价隔离（仅看自己的）+ 邀请隔离（可见范围）
- 报价可多次修改，以最后一次保存为准，截止后禁止修改
- JWT 鉴权 + scrypt 密码哈希（无原生依赖）
- 66 个单元/集成测试覆盖核心规则
- 容器化部署 · `1panel-network` 直连现有 Postgres

## 技术栈

| 类别 | 选型 |
|---|---|
| 后端 | Node 22 · Express 4 · TypeScript |
| 数据库 | PostgreSQL 15+ · Drizzle ORM · drizzle-kit migration |
| 认证 | 自建账号密码（scrypt）+ JWT（HS256，24h） |
| 前端 | React 18 · Vite · Tailwind CSS · shadcn 风格手写组件 |
| 测试 | Vitest · supertest |
| 部署 | Docker 多阶段构建 · node:22-alpine |

## 快速开始（开发）

```bash
npm install
cp .env.example .env       # 编辑 DATABASE_URL 等
npm run db:migrate          # 跑迁移（依赖 .env 的 DATABASE_URL）
npm run dev:server          # 终端 A：Express 监听 :3000
npm run dev:web             # 终端 B：Vite 监听 :5173（自动代理 /api 到 :3000）
```

默认管理员账号由 `.env` 的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 决定，**首次启动自动 seed**。

## 快速开始（生产 · Docker）

```bash
docker compose up -d --build
# 容器: 8090 -> 3000
```

容器要求：
- 已存在 1Panel postgres 容器（docker 网络 `1panel-network`，容器别名 `postgresql`）
- 主机 `1panel-network` 网络已存在
- `Dockerfile` 多阶段构建：先 `npm ci` 跑 `vite build`，最终镜像仅保留生产依赖 + 构建产物

首次部署：
```bash
# 1) 在 1Panel postgres 里创建角色 + 库
docker exec 1Panel-postgresql-NSJt psql -U <超级用户> -c \
  "CREATE ROLE supplier_quote LOGIN PASSWORD '<密码>';"
docker exec 1Panel-postgresql-NSJt psql -U <超级用户> -c \
  "CREATE DATABASE supplier_quote OWNER supplier_quote;"

# 2) 配置 .env（Docker 用）：DB_PASSWORD 必须是供应商'密码'；容器内 DATABASE_URL 自动拼接 @postgresql
# 3) 启动后通过 ufw 暴露 8090
sudo ufw allow 8090/tcp
```

详细部署见 [docs/deploy.md](docs/deploy.md)。

## 命令

```bash
npm run dev:server      # 开发模式后端（热重启）
npm run dev:web         # 开发模式前端（Vite HMR）
npm run build           # 生产构建前端 → dist/client
npm start               # 生产模式启动后端
npm test                # 跑 vitest
npm run typecheck       # tsc --noEmit
npm run db:generate     # drizzle-kit 生成迁移（schema 变更后）
npm run db:migrate      # 应用迁移
```

## 项目结构

```
supplier-quote/
├── server/
│   ├── index.ts              # 启动入口（migrate → seed → listen）
│   ├── app.ts                # Express app 工厂
│   ├── auth/                 # password / jwt / middleware
│   ├── db/                   # drizzle schema / client / migrate
│   ├── routes/               # auth / admin / supplier 路由
│   └── services/             # ranking / quotes / invitations
├── src/                      # React 前端
│   ├── pages/                # 7 个页面
│   ├── components/ui/        # shadcn 风格手写组件
│   ├── api.ts auth-context.tsx use-polling.ts lib/utils.ts
│   ├── App.tsx main.tsx index.css
├── tests/                    # 66 个测试（vitest + supertest）
├── drizzle/                  # 迁移 SQL
├── Dockerfile                # 多阶段构建
├── docker-compose.yml        # 单服务：8090 -> 3000
└── docs/
    ├── design/system-design.md     # 系统设计
    ├── plans/implementation-plan.md # 实施计划
    ├── deploy.md                    # 部署指南
    ├── decisions/                   # 架构决策记录
    └── operations/                  # 运维手册
```

## 核心规则（详见 [design](docs/design/system-design.md)）

| 规则 | 实现 |
|---|---|
| 名次：金额低优先；同价按首次提交 | `services/ranking.ts` + 数据库行内 `ORDER BY amount, created_at` |
| 截止锁定（服务器时间为准） | `services/quotes.ts` 事务内 `SELECT FOR UPDATE` + `WHERE deadline > now()` |
| 报价修改不刷新首提时间 | `quotes.created_at` 仅 INSERT 设置，UPDATE 不动 |
| 数据隔离：仅看自己 | 所有 supplier 查询固定 `supplier_id = 当前用户` |
| 邀请隔离：未邀请者看不到 | 路由级 inner join 到 `tender_invitations`；PUT 返 403 |
| 邀请名单可调整（含截止后） | 邀请管理路由绕过截止/关闭守卫 |
| 取消邀请保留历史报价 | 仅删除邀请行，不删报价 |

## 文档

- [系统设计](docs/design/system-design.md) — 数据模型、API、决策记录
- [实施计划](docs/plans/implementation-plan.md) — 19 个 TDD 任务
- [部署指南](docs/deploy.md) — 1Panel postgres 接入、生产部署
- [运维手册](docs/operations/) — 升级、备份、故障排查
- [架构决策](docs/decisions/) — 关键选择的理由

## 路线图（YAGNI 之外）

- 公网接入：HTTPS 反代 + 更严格密码策略（接入方式确定后再加）
- 邮件 / 飞书通知：报价截止前提醒
- 附件上传：规格书、报价明细单

## 许可

仅供内部使用，详见 [LICENSE](LICENSE)。