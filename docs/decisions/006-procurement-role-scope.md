# ADR 006: 多管理员视图（procurement 角色）

## 状态

已采纳 · 2026-09-17

## 背景

原设计中管理员（admin）= 超级管理员，全权管理所有数据。当企业内多个采购员并行工作时，需要把"看全部"与"只看自己负责的"区分开，避免互相干扰与越权。

## 备选

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. 新增 procurement 角色** ✅ | 显式角色 + 复用现有 enum 模式；与 supplier 角色对称 | 需要 enum 迁移 |
| B. 加 `is_super` 布尔字段到 admin | 无 enum 迁移 | 布尔标志可读性差；容易写错 |
| C. 多对多 `tender_assignees` 中间表 | 支持一人管多个 & 多人管一个 | 引入额外 join + UI 复杂度；现实场景此需求不显著 |

## 决策

**方案 A**：在 `users.role` enum 增加 `'procurement'`；新增 `requireRole(['admin','procurement'])` 用于 admin 路由；procurement 仅可见与可操作 `tenders.created_by = me.id` 的招标。

### 数据隔离规则

| 操作 | admin | procurement |
|---|---|---|
| `GET /admin/tenders` | 全部 | 仅自己创建的 |
| `POST /admin/tenders` | created_by = 任意（可选） | created_by 强制 = me |
| `GET /admin/tenders/:id` | 任意 | 仅自己创建的；他人 → **404** |
| `PATCH /admin/tenders/:id` | 任意；可改 `created_by` 重新指派 | 仅自己创建的；**禁止改 `created_by`** |
| `POST /admin/tenders/:id/close` | 任意 | 仅自己创建的 |
| `POST /invitations` / `DELETE /invitations/:sid` | 任意 | 仅自己创建的 |
| `GET/POST/PATCH /admin/users` | 全部 | 任意；两类用户均可创建供应商 |

## 理由

1. **可读性**：`role: 'procurement'` 比 `is_super: false` 自解释。
2. **责任清晰**：procurement 创建的招标其 `created_by` 不可被自己或他人改写，避免责任真空（"这个招标的报价由谁负责？"永远唯一）。
3. **无新表**：复用现有 `created_by` 字段 + 索引（已有 `tenders.created_by` FK），无 DDL 改动。
4. **与 supplier 隔离对称**：供应商用 `tender_invitations` 中间表实现邀请隔离；procurement 直接用 `created_by` 实现范围隔离，模式一致但实现更简单。

## 代价

- ⚠️ 路由层需要每个 admin 路由显式检查 `created_by` —— 增加 6 处中间件式守卫。
- ⚠️ 现有 admin 用户不会被自动转换为 procurement；需要超级管理员主动创建新账号并赋 role=procurement。
- ⚠️ 数据库 enum 迁移 `ALTER TYPE user_role ADD VALUE 'procurement'` —— postgres 必须在事务外执行；drizzle 0.30 已支持。

## 实现

- Drizzle migration：增量 enum + 应用
- `server/auth/middleware.ts`：`Role` 类型扩展；`requireRole` 接受数组
- `server/services/admin-guard.ts`：`assertOwnTender(db, tenderId, me)` 辅助函数
- `server/routes/admin.ts`：6 个路由加入守卫
- `server/routes/admin.ts`：`POST /admin/users` 接受 role 字段
- 前端 `AdminUsersPage`：表单加 role 单选
- 前端 `App.tsx`：`<Protected role="admin">` 改为 `<Protected role={['admin','procurement']}>`
## 2026-09-17 增量：账号管理权限分级

### 问题

procurement 看得到全账号列表（包括其他采购员和 admin），且能创建任何角色账号（包括 `admin`）。这是"看改都开放"语义过宽导致的安全问题。

### 决策

| 操作 | admin | procurement |
|---|---|---|
| `GET /users` | 全部 | `role='supplier'` 全部 + `created_by = me` 的任何角色 |
| `POST /users` | 任意 role | `supplier` 或 `procurement`；禁止 `admin` |
| `PATCH /users/:id` | 任意 | 仅 `role='supplier' AND created_by = me` |
| 修改自己的 `role` | 允许 | **禁止**（防降权） |

### 理由

- **procurement 不能自封 admin** — 防止越权
- **procurement 可创建 supplier + procurement** — 团队内日常管理需要
- **列表过滤** — 不暴露其他 procurement 创建的 supplier 之外的账号；避免把"陌生人"显示在自己视野里
- **自改 role 禁止** — 防止 procurement 把自己降级为 supplier 来绕过隔离

### 实现

- `users.created_by` 字段（nullable，初始 seed admin 为 null）
- drizzle 迁移 0003
- 服务层 `users-permissions.ts` 集中判权
- 路由层守卫 + 服务层校验双重保险

### 代价

- ⚠️ 增加 ~120 行代码 + 1 张迁移
- ⚠️ 现有 procurement 用户的可见账号范围立即变小（向下兼容，无破坏性）

## 2026-09-17 增量：系统管理员保护 + 账号硬删除

### 问题

`admin` 角色内部没有再分层，导致两个问题：
1. 任何 admin（甚至自己创建的 admin）都能修改 `admin` 用户名账号；万一误删，整个系统就锁死。
2. 没有任何删除账号的能力；离职 / 测试账号只能停用，列表里一直留尸。

### 决策

- 通过环境变量 `SYSTEM_ADMIN_USERNAME`（默认 `admin`）标识系统内置账号；启动 seed 沿用该名字。
- 系统管理员账号：
  - **列表隐藏**（admin / procurement 视角都不显示）
  - **POST 拒绝**创建同名账号（409）
  - **PATCH 拒绝**任何修改（403）
  - **DELETE 拒绝**（403）
- 新增 `DELETE /admin/users/:id`：仅 admin 可调用
  - 拒绝删除自己（403）
  - 拒绝删除系统管理员（403）
  - 有关联数据（创建了 tender 或提交了 quote）返回 409，提示用户先清理
  - 删除 procurement 前，自动把其创建的下属账号的 `created_by` 置 NULL（避免 FK 失败）

### 理由

- **为什么用 env 而非 DB 字段？** env 部署期确定且不可改、跨实例一致；DB 字段需要新增迁移并保留一致性约束。`.env` 是部署边界，绑定到具体实例的"出厂身份"。
- **为什么硬删除而非软删除？** 软删除会让列表混淆"已停用"与"已删除"两种状态。supplier 账号停用已足够表达"暂时禁用"；硬删除表达"撤销存在"，语义清晰。

### 实现

- `server/env.ts` 新增 `systemAdminUsername()`
- `server/services/users-permissions.ts` 新增 `isSystemAdmin / canDeleteUser / countUserFootprint`；`listVisibleUserIds` 过滤系统管理员
- `server/routes/admin.ts` `PATCH` 加 isSystemAdmin 守卫；新增 `DELETE` 端点
- `src/pages/AdminUsersPage.tsx` 操作按钮对所有非系统账号开放；显示 confirm 二次确认

### 代价

- ⚠️ ~150 行新代码 + 11 个新测试
- ✅ 部署后修改 `SYSTEM_ADMIN_USERNAME` + 重启即可重命名系统管理员
