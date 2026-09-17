# 更新日志

本项目的所有非显式改动记录在此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

### 待定

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
