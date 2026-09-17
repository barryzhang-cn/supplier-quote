# 更新日志

本项目的所有非显式改动记录在此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

### 待定

## [0.4.0] - 2026-09-17

### 新增

- 系统管理员账号保护：通过 `SYSTEM_ADMIN_USERNAME` 标识（默认 `admin`），列表隐藏 / 禁止修改 / 禁止删除
- 账号删除：`DELETE /admin/users/:id`，仅 admin 可操作；有关联数据（招标 / 报价）返回 409
- 超级管理员完整管理面板：可对所有非系统账号执行 重置密码 / 停用 / 启用 / 删除

### 变更

- `users-permissions.ts` 新增 `isSystemAdmin / canDeleteUser / countUserFootprint`，`listVisibleUserIds` 过滤系统管理员
- 前端 AdminUsersPage 操作按钮对所有非系统账号开放；显示 confirm 二次确认
- `POST /admin/users` 拒绝创建与系统管理员同名账号（409）

### 兼容性

- 旧部署无需迁移；通过 .env 配置 `SYSTEM_ADMIN_USERNAME`（默认 `admin`）

## [0.3.0] - 2026-09-17

### 新增

- 账号管理权限分级：procurement 不能创建超级管理员；列表按 `created_by` 过滤；禁止自改 role
- `users.created_by` 字段 + drizzle 迁移 0003
- 服务层 `users-permissions.ts`：`canCreateRole / canModifyUser / canChangeRole / listVisibleUserIds`
- 前端 AdminUsersPage 按角色显示可用 role + 隐藏对内部账号的修改按钮
- 新增 14 个测试覆盖以上规则

## [0.2.0] - 2026-09-17

### 新增

- 多管理员视图：procurement 角色，仅能看到与操作自己创建的招标
- 邀请名单：管理员可按供应商筛选，未受邀供应商对招标完全不可见
- 端口 8090 单 Docker 容器 + 复用现有 1Panel Postgres

## [0.1.0] - 2026-09-17

### 新增

- 招标发布 / 编辑 / 提前关闭 / 截止自动锁定
- 实时名次：金额低者靠前；同价按首次提交时间排序（首次提交时间不刷新）
- 三层数据隔离：报价隔离 + 邀请隔离 + 范围隔离（procurement）
- JWT 鉴权 + scrypt 密码哈希
- 报价可多次修改，以最后一次保存为准，截止后禁止修改
- 77 个单元 / 集成测试
