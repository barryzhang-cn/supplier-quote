# 贡献指南

## 提交流程

1. Fork 仓库（个人私有仓可跳过此步）
2. 在 `feat/<short-name>` 分支开发：`git checkout -b feat/<short-name>`
3. 提交粒度细，commit message 用中文简述：`feat: 邀请名单增量` / `fix: 截止后 PATCH 报错`
4. 推送前 `npm test && npm run typecheck` 必须通过
5. 推送触发 reviewer（个人私有仓可省略）

## 开发规范

- **TDD**：新功能先写失败测试，再实现，最后重构
- **Spec 先行**：跨多个任务的需求，先写 `docs/design/` 与 `docs/plans/` 草稿再写代码
- **小步提交**：每个 commit 对应一个独立可工作的改动，不要把"重构 + 新功能"混在一个 commit
- **ADR 记录**：影响架构的选择（包、库、模式）单独写一篇 `docs/decisions/NNN-*.md`

## 代码风格

- TypeScript strict 模式（已配置）
- 后端路由文件按 `auth / admin / supplier` 分目录
- 服务函数放 `server/services/`，只暴露纯函数（DB 操作除外）
- React 组件按 `pages / components/ui` 分层
- UI 组件优先纯组件 + props，避免 `displayName` 之外的内部状态

## 命名

- 数据库表：复数（`users`、`tenders`）
- 中间表：`<单数a>_<单数b>s`（`tender_invitations`）
- 服务函数：动宾结构（`computeRanks` / `upsertQuote` / `replaceInvitations`）
- 测试用例：陈述句（"金额低者名次靠前"）

## 数据库迁移

- 改 schema 后跑 `npm run db:generate` 生成 SQL
- 把生成的 `drizzle/000N_*.sql` 一起 commit
- 生产环境会自动应用迁移

## 提交检查清单

- [ ] `npm test` 全过
- [ ] `npm run typecheck` 无错误
- [ ] `npm run build` 构建成功
- [ ] 容器化相关改动测试过 `docker build`
- [ ] 新增 ADR（如有架构决策）
- [ ] 更新 `README.md` / `docs/`（如有功能/部署变更）