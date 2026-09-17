# ADR 001: 单容器 + 复用 1Panel Postgres

## 状态

已采纳 · 2026-09-17

## 背景

需要为供应商报价系统选择部署形态。服务器已有 1Panel 管理面板和 PostgreSQL 18.6 容器在运行（数据库内已有多个业务库如 `hrsystem`）。新系统不应引入独立的 PostgreSQL 实例以免增加维护成本。

## 备选

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. 单 Node 容器 + 复用现有 Postgres** ✅ | 资源占用最小；备份跟 1Panel 一套；与 hr-dashboard/sale-dashboard 风格一致 | 应用与 Dify 等共用一个 postgres 实例（独立 database 隔离足够） |
| B. 独立全家桶（app + 专属 postgres 容器） | 与现有 postgres 零耦合 | 多一个容器、多一份备份策略 |
| C. Next.js 全栈单容器 | 框架一体化 | 偏重、对纯 CRUD 工具不必要 |

## 决策

**方案 A**：Node 22 容器同时托管 Express API 与 Vite 静态产物（同一进程两端口由容器映射），通过 `1panel-network` 直连现有 postgres 容器（容器别名 `postgresql`，不走宿主机防火墙）。

## 后果

- ✅ 端口 8090 唯一对外（容器内 3000 不暴露）
- ✅ 数据库迁移由 drizzle-kit 在容器启动时自动应用
- ✅ 容器体积约 150MB（多阶段构建，仅生产依赖 + 静态文件）
- ⚠️ 与其他业务共用 postgres 18.6 实例 → 通过独立 database 与角色做应用级隔离
- ⚠️ 新增容器需先确保 1panel-network 已存在（`docker network ls`）
- ⚠️ 升级需 `docker compose up -d --build`（迁移会自动跑）