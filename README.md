<div align="center">

# Supplier Quote

**供应商报价管理系统** — 公司采购方发布招标邀请，供应商在线报价并实时查看名次。

[特性](#-特性) · [快速开始](#-快速开始) · [架构](#-架构) · [路线图](#-路线图) · [贡献](./CONTRIBUTING.md) · [许可证](./LICENSE)

</div>

---

> 内网部署 · 单 Docker 容器 · 复用现有 PostgreSQL · MIT 许可证

**供应商报价系统** 为有内部采购需求的企业提供了一套轻量级、价格优先的招标工具。系统不追求合规与公开性，只追求 **快、内网安全、可见性可控**。

## 为什么做这个

市场上大多数企业采购系统（[Procure Suite](https://www.procuresuite.io/reverse-auction-software/)、[ProcureKey](https://www.procurekey.com/rfx-definition-type-process/)）都是 SaaS 或昂贵的 ERP 模块。你不需要这些复杂的东西，你只要：

- 采购员在内部网络发招标
- 只让被邀请的供应商看到
- 金额最低 + 同价先提交者胜出
- 名次对其他供应商不可见
- 内网部署，数据不外流

这就是 **Supplier Quote**。

## 特性

- **三种角色**：超级管理员 / 招标管理员 / 供应商
- **三层数据隔离**：
  1. 邀请隔离 — 未受邀者对招标视而不见
  2. 范围隔离 — 招标管理员仅能看到自己创建的招标
  3. 报价隔离 — 供应商仅看自己的报价
- **名次规则**：金额低者靠前；同价按首次提交时间排序（首次提交时间不刷新，防止后改者插队）
- **截止锁定**：服务端时间为准，事务内 `SELECT FOR UPDATE` 防并发
- **邀请名单可控**：管理员按供应商筛选，未邀请者无法查看 / 报价
- **单 Docker 容器**：约 150MB，~3 秒启动
- **复用现有 PostgreSQL**：不引入额外数据库实例
- **83 个测试**：覆盖全部核心规则

## 技术栈

| 类别 | 选型 |
|---|---|
| 后端 | Node 22 + Express 4 + TypeScript（strict） |
| 数据库 | PostgreSQL 15+ + Drizzle ORM + drizzle-kit |
| 认证 | 自建账号密码（scrypt）+ JWT（HS256，24h 过期） |
| 前端 | React 18 + Vite + Tailwind CSS + shadcn 风格手写组件 |
| 测试 | Vitest + supertest |
| 部署 | Docker 多阶段构建（node:22-alpine） |

## 架构

```
┌─ docker network ──────────────────────────────────┐
│                                                    │
│  浏览器 ──HTTP──►  supplier-quote 容器             │
│                    (Express + Vite 静态产物)       │
│                          │ DATABASE_URL            │
│                          ▼                         │
│                    PostgreSQL（你的现有实例）        │
│                    database: supplier_quote        │
└────────────────────────────────────────────────────┘
```

详细架构见 [docs/design/system-design.md](docs/design/system-design.md)。

## 快速开始（本地开发）

```bash
git clone https://github.com/barryzhang-cn/supplier-quote.git
cd supplier-quote
npm install
cp .env.example .env       # 编辑 DATABASE_URL 等
npm run db:migrate          # 应用迁移（依赖 .env 的 DATABASE_URL）
npm run dev:server          # 终端 A：Express 监听 :3000
npm run dev:web             # 终端 B：Vite 监听 :5173（自动代理 /api 到 :3000）
```

默认管理员账号由 `.env` 的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 决定，**首次启动自动 seed**。

## 快速开始（生产 · Docker）

```bash
# 一次性：在你的 PostgreSQL 内创建专用角色与库
docker exec <your-postgres> psql -U <superuser> -c \
  "CREATE ROLE supplier_quote LOGIN PASSWORD '<密码>';"
docker exec <your-postgres> psql -U <superuser> -c \
  "CREATE DATABASE supplier_quote OWNER supplier_quote;"

# 配置 .env（生产用）：DB_PASSWORD + JWT_SECRET + ADMIN_PASSWORD
# 启动
docker compose up -d --build
```

容器要求：已存在名为 `1panel-network` 的 docker 网络 + 同网络内的 postgres 容器（别名 `postgresql`）。

完整部署见 [docs/deploy.md](docs/deploy.md)。

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
├── server/                       # 后端
│   ├── index.ts                  # 启动入口（migrate → seed → listen）
│   ├── app.ts                    # Express app 工厂
│   ├── auth/                     # password / jwt / middleware
│   ├── db/                       # drizzle schema / client / migrate
│   ├── routes/                   # auth / admin / supplier
│   └── services/                 # ranking / quotes / invitations / admin-guard
├── src/                          # React 前端
│   ├── pages/                    # 7 个页面
│   ├── components/ui/            # shadcn 风格手写组件
│   └── ...
├── tests/                        # 83 个 vitest 测试
├── drizzle/                      # 迁移 SQL
├── Dockerfile                    # 多阶段构建
└── docs/
    ├── design/                   # 系统设计 + 数据模型 + API
    ├── plans/                    # 实施计划
    ├── deploy.md                 # 部署指南
    ├── decisions/                # 架构决策记录（6 篇 ADR）
    └── operations/               # 运维手册
```

## 核心规则

| 规则 | 实现位置 |
|---|---|
| 名次：金额低优先；同价按首次提交 | [`server/services/ranking.ts`](server/services/ranking.ts) |
| 截止锁定（服务器时间为准） | [`server/services/quotes.ts`](server/services/quotes.ts) 事务内 `SELECT FOR UPDATE` |
| 修改报价不刷新首提时间 | `quotes.created_at` 仅 INSERT 设置，UPDATE 不动 |
| 数据隔离：仅看自己 | 所有 supplier 查询固定 `supplier_id = 当前用户` |
| 邀请隔离：未邀请者看不到 | `server/routes/supplier.ts` 路由级 inner join |
| 范围隔离：procurement 仅看自己创建的 | [`server/services/admin-guard.ts`](server/services/admin-guard.ts) |
| 邀请名单可调整（含截止后） | 邀请管理路由绕过截止/关闭守卫 |

## 路线图

| 优先级 | 功能 | 说明 |
|---|---|---|
| 高 | 投标附件上传 | 规格书 / 报价明细 PDF/Excel |
| 高 | 邮件 / 飞书通知 | 截止前提醒 + 报名通知 |
| 中 | 实时反向拍卖 | 倒计时、auto-bid-sniping 防护 |
| 中 | 评分模型 | 价格 + 资质 + 服务承诺加权 |
| 中 | 导出报表 | CSV / Excel |
| 低 | 公网访问 + HTTPS 反代 | 内部使用 + VPN 即可 |
| 低 | 多币种 / 含税未税 | 国内场景为主 |
| 低 | 审计日志 | 公开招标合规用 |

完整讨论见 [GitHub Issues](https://github.com/barryzhang-cn/supplier-quote/issues)。

## 文档

- [设计文档](docs/design/system-design.md) — 数据模型、API、决策记录
- [实施计划](docs/plans/implementation-plan.md) — 19 + 12 个 TDD 任务
- [部署指南](docs/deploy.md) — 1Panel Postgres 接入、生产部署
- [运维手册](docs/operations/upgrade-and-backup.md) — 升级、备份、故障排查
- [架构决策](docs/decisions/) — 关键选择的理由（[README](docs/decisions/README.md)）

## 贡献

欢迎贡献！请先读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

第一次参与？找标了 `good first issue` 的 issue，或翻 [Issue 模板](https://github.com/barryzhang-cn/supplier-quote/issues/new/choose)。

任何大小都欢迎：

- 文档错别字、链接失效
- 复现某个 bug 并报告
- 加测试用例
- 优化某段代码
- 新增 ADR（关键架构决策）

## 安全

请**不要**在公开 Issue 中披露未修补的漏洞。详见 [SECURITY.md](./SECURITY.md)。

## 许可证

[MIT](./LICENSE) — 详见 LICENSE 文件。

## 致谢

- [shadcn/ui](https://ui.shadcn.com/) — 设计 token 与组件范式
- [Drizzle ORM](https://orm.drizzle.team/) — 优雅的 TypeScript ORM
- [Procure Suite](https://www.procuresuite.io/reverse-auction-software/) / [ProcureKey](https://www.procurekey.com/rfx-definition-type-process/) — 商业产品参考
