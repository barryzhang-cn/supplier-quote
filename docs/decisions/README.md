# 架构决策记录（ADR）

本目录记录关键架构选择的**理由**与**权衡**，便于后续维护者快速理解"为什么这么做"。

## ADR 索引

| 编号 | 标题 | 日期 |
|---|---|---|
| [001](./001-deployment-single-container.md) | 单容器 + 复用 1Panel Postgres | 2026-09-17 |
| [002](./002-table-component-shadcn-ui.md) | shadcn 风格手写组件，不用 antd | 2026-09-17 |
| [003](./003-ranking-by-first-submission.md) | 名次按"首次提交时间"排序而非"更新时间" | 2026-09-17 |
| [004](./004-invitations-hard-default-empty.md) | 邀请名单硬邀请 + 默认不勾不邀请 | 2026-09-17 |
| [005](./005-scrypt-not-bcrypt.md) | 密码哈希用 Node 内置 scrypt 而非 bcrypt | 2026-09-17 |
| [006](./006-procurement-role-scope.md) | 多管理员视图（procurement 角色） | 2026-09-17 |

后续新决策请按 `NNN-<短标题>.md` 命名追加。