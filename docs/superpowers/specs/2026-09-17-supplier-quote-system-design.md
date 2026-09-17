# 供应商报价系统 — 设计文档

日期：2026-09-17
状态：已确认（用户批准）

## 1. 概述

供应商报价管理系统：公司采购方（管理员）发布招标邀请，供应商在线报价并可实时查看自己的名次。

- **管理员（采购方）**：发布招标、管理供应商账号、查看全部报价与名次
- **供应商**：登录后参与报价、提交/修改报价、查看自己的名次

### 已确认的范围决策

| 决策点 | 结论 |
|---|---|
| 部署 | 方案 A：单 Node 容器 + 复用现有 1Panel Postgres（新建专属 database） |
| 网络接入 | 先内网用起来（不暴露公网），供应商接入方式后续再定 |
| 附件 | 不支持，纯文本招标与报价 |
| 表格组件 | shadcn/ui Table（不引入 antd），紧凑模式风格 |
| 实时性 | 5 秒轮询，不上 WebSocket |

## 2. 架构

```
┌─ 内网 (172.18.9.55) ────────────────────────────┐
│                                                  │
│  浏览器 ──HTTP :8090──► supplier-quote 容器       │
│                        (node:22-alpine)          │
│                        ├─ Express API (/api/*)   │
│                        └─ 静态文件 (Vite build)   │
│                              │                   │
│                              ▼ DATABASE_URL      │
│                        1Panel-postgresql         │
│                        (postgres:18.6-alpine)    │
│                        database: supplier_quote  │
└──────────────────────────────────────────────────┘
```

- **后端**：Node.js + Express + TypeScript，同一进程托管 API 与前端静态文件
- **前端**：React 18 + Vite + Tailwind CSS + shadcn/ui，react-router，中文界面
- **ORM**：Drizzle ORM + drizzle-kit migration（容器启动时自动执行）
- **认证**：账号密码（Node 内置 scrypt 哈希）+ JWT（HS256，24h 过期），不依赖外部用户系统

## 3. 数据模型

### users

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| username | text UNIQUE NOT NULL | 登录名 |
| password_hash | text NOT NULL | scrypt（node:crypto，无原生依赖） |
| role | enum('admin','supplier') | |
| company_name | text | 供应商公司名（管理员可为空） |
| active | boolean DEFAULT true | 停用后禁止登录 |
| created_at | timestamptz | |

### tenders

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| title | text NOT NULL | |
| description | text | 招标说明（纯文本） |
| deadline | timestamptz NOT NULL | 报价截止时间 |
| status | enum('open','closed') DEFAULT 'open' | 管理员可提前关闭 |
| created_by | uuid FK → users.id | |
| created_at | timestamptz | |

有效关闭判定：`status = 'closed' OR now() >= deadline`（服务器时间为准）。

### quotes

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| tender_id | uuid FK → tenders.id | |
| supplier_id | uuid FK → users.id | |
| amount | numeric(14,2) NOT NULL | 报价金额（元，两位小数） |
| note | text | 报价说明，可空 |
| created_at | timestamptz | **首次提交时间**（名次平局判定依据） |
| updated_at | timestamptz | 最近一次保存时间 |

约束：`UNIQUE(tender_id, supplier_id)` — 每供应商每招标一条记录，重复报价为原地更新（满足"可多次修改，以最新一次保存为准"）。

### tender_invitations（招标邀请名单，2026-09-17 增量需求）

| 字段 | 类型 | 说明 |
|---|---|---|
| tender_id | uuid FK → tenders.id ON DELETE CASCADE | |
| supplier_id | uuid FK → users.id ON DELETE CASCADE | |
| invited_at | timestamptz DEFAULT now() | |

约束：`UNIQUE(tender_id, supplier_id)`。外键 ON DELETE CASCADE：招标/账号删除时邀请自动清。

### 数据迁移（一次性 backfill）

在新增 `tender_invitations` 表后，对**已有**的每个开放中或历史招标插入"当前全部供应商角色用户"作为邀请 —— 保证现有招标在切换前后可见性不变（已可见的继续可见）。后续新增招标按新规则执行。

## 4. 核心规则

1. **名次规则**：`ROW_NUMBER() OVER (ORDER BY amount ASC, created_at ASC)`。金额低者靠前；金额相同，首次提交时间早者靠前。修改报价**不刷新**首次提交时间（防止后改者插队，同时奖励尽早提交）。
2. **截止锁定**：报价的 INSERT/UPDATE 语句带守卫条件 `WHERE tender 状态 open AND deadline > now()`（数据库级守卫，即使绕过前端也无法在截止后写入）。返回 409 表明已截止/已关闭。
3. **数据隔离（双层）**：
   - **报价隔离**：供应商的所有报价查询固定 `supplier_id = 当前用户`；名次接口仅返回 `{rank, totalParticipants}`，**不暴露其他供应商的报价金额与公司名**。
   - **邀请隔离（2026-09-17 新增）**：未在 `tender_invitations` 中的供应商对该招标**完全不可见**：`GET /api/tenders` 列表中不出现；`GET /api/tenders/:id` 返回 404；`PUT /api/tenders/:id/quote` 返回 403「您未受邀参与此招标」。管理员永远绕过此隔离。
4. **邀请名单可变性（2026-09-17 新增）**：招标发布后任何时刻可增删（即便已有报价）。被移除的供应商立即看不到招标、不能再报价；但其**历史报价在管理员账面上保留**。创建/编辑时可批量调整（`invitedSupplierIds` 字段，幂等）；运行期可走单条邀请管理接口（见 API 表）。
5. **邀请默认值（2026-09-17 新增）**：创建/编辑招标时，`invitedSupplierIds` 不传或传空数组 = **不邀请任何人**（刻意收紧默认）。
6. **实时名次**：供应商名次卡片、管理员报价榜均 5 秒轮询。

## 5. API 设计

所有接口前缀 `/api`，鉴权走 `Authorization: Bearer <JWT>`。

### 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /auth/login | {username, password} → {token, user{id, role, companyName}}；停用账号返回 403 |
| GET | /auth/me | 当前用户信息 |

### 管理员（role=admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | /admin/users | 列表 / 新建供应商账号（管理员设置初始密码） |
| PATCH | /admin/users/:id | 重置密码 / 停用启用 |
| GET/POST | /admin/tenders | 招标列表（含报价数统计）/ 新建招标；POST 可选 body `invitedSupplierIds: string[]`（2026-09-17 新增） |
| GET/PATCH | /admin/tenders/:id | 详情（含全部报价+名次+邀请名单 `invitedSupplierIds`）/ 编辑；PATCH 可选 body `invitedSupplierIds: string[]`（2026-09-17 新增） |
| POST | /admin/tenders/:id/close | 提前关闭 |
| POST | /admin/tenders/:id/invitations | 增补单个邀请 `{supplierId}`；用于运行期调整（2026-09-17 新增） |
| DELETE | /admin/tenders/:id/invitations/:supplierId | 取消单个邀请；该供应商历史报价保留（2026-09-17 新增） |

### 供应商（role=supplier）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /tenders | 招标列表（开放中 + 已截止的，含状态标记；含我的报价状态/名次摘要） |
| GET | /tenders/:id | 招标详情 |
| GET/PUT | /tenders/:id/quote | 读/写自己的报价（upsert；截止或关闭后 PUT 返回 409） |
| GET | /tenders/:id/ranking | {rank, totalParticipants}（仅自己的名次） |

错误约定：401 未登录 / 403 无权限或停用 / 404 不存在 / 409 已截止或已关闭 / 422 参数校验失败。

## 6. 前端页面

| 路由 | 角色 | 内容 |
|---|---|---|
| /login | 公开 | 登录表单，按角色跳转 |
| /admin | admin | 招标列表：标题、截止时间、状态、报价数（紧凑表格） |
| /admin/tenders/new | admin | 新建招标表单（含"邀请供应商"多选区，2026-09-17 新增） |
| /admin/tenders/:id | admin | 招标详情 + 全部报价榜（名次、公司、金额、首次提交、最近更新）+ 编辑（含邀请名单调整）+ 提前关闭 + 单条邀请增删（2026-09-17 新增） |
| /admin/users | admin | 供应商账号管理：列表、新建、重置密码、停用 |
| / | supplier | 招标列表（开放中 + 已截止，状态标记），显示我的报价状态/金额/名次徽章 |
| /tenders/:id | supplier | 招标详情 + 报价表单（金额、备注；截止前可反复修改，截止后只读并提示）+ 我的名次卡片（第 N 名 / 共 M 家，5s 轮询；截止后仍可查看最终名次） |

### 设计规范（按需求文档执行）

- 主色 primary `hsl(221, 83%, 53%)`，白字；背景 `hsl(210, 40%, 98%)`，白色卡片
- 文字 foreground `hsl(222, 47%, 11%)`，辅助 `hsl(215, 16%, 47%)`；边框 `hsl(214, 32%, 91%)`
- 页面最大宽 1200px 居中；卡片 p-6、区块间距 gap-6
- 标题：页面 text-2xl font-semibold；卡片 text-lg font-semibold；正文 text-sm；辅助 text-xs
- 卡片 rounded-lg border shadow-sm；按钮/输入框 rounded-md；表格紧凑模式（shadcn/ui Table）

## 7. 部署

- 项目目录：`/home/gdby/supplier-quote`
- **数据库初始化**（一次性，1Panel postgres 内）：

```sql
CREATE USER supplier_quote WITH PASSWORD '<密码>';
CREATE DATABASE supplier_quote OWNER supplier_quote;
```

- `Dockerfile`：node:22-alpine 多阶段构建（builder：构建前端+后端 → runner：生产依赖+静态文件），`TZ=Asia/Shanghai`
- `docker-compose.yml`：单服务 `app`，端口 `8090:3000`；环境变量：
  - `DATABASE_URL=postgres://supplier_quote:<密码>@172.18.9.55:5432/supplier_quote`
  - `JWT_SECRET=<随机 48 位 hex>`
  - `ADMIN_USERNAME` / `ADMIN_PASSWORD`（首次启动无 admin 用户时自动 seed 初始管理员）
- 启动流程：容器入口先 `drizzle-kit migrate`（或等价 migrate 脚本）→ seed 检查 → 启动 Express
- 防火墙：`sudo ufw allow 8090/tcp`（用户手动执行）
- 备份：`supplier_quote` 库随现有 postgres 备份策略，数据量很小

## 8. 测试策略

- 后端核心逻辑 Vitest 单元/集成测试（TDD 推进）：
  - 名次排序（含金额相同按首次提交时间的平局判定；修改不刷新首提时间）
  - 截止锁定（deadline 后 PUT 返回 409；提前关闭后 409）
  - 数据隔离（供应商无法读取他人报价；PUT 无法写入他人名下）
  - 认证（登录、JWT 过期、停用账号拒绝）
- 前端以手 smoke 为主（内网工具规模，不为表单写重测试）

## 9. 非目标（YAGNI）

- 附件上传/下载
- WebSocket 实时推送
- 邮件/企业微信通知
- 多币种、含税/未税切换、折扣明细
- 供应商自助注册（账号一律管理员创建）
- 公网暴露与 HTTPS（接入方式确定后再加）

## 10. 决策记录（增量需求：2026-09-17 邀请名单）

| 决策 | 选项 → 选定 | 理由 |
|---|---|---|
| 邀请机制严格度 | 软 / 仅标记 / **硬邀请** | 用户明确要求"未邀请者看不到招标"，符合需求文档"受邀参与报价"的语义 |
| 名单可变性 | 冻结 / **可随时调整** | 现实场景常需补充邀请遗漏的供应商；移除时报价保留避免破坏审计 |
| 不勾默认值 | 全量默认 / **不勾则不邀请** | 用户刻意选择收紧默认，强制管理员显式选择 |
