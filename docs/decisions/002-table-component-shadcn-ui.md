# ADR 002: shadcn 风格手写组件，不用 antd

## 状态

已采纳 · 2026-09-17

## 背景

需求文档同时出现两套 UI 规范：shadcn/ui（卡片/按钮/输入框）+ antd-table 紧凑表格。前端栈选 React + Tailwind，shadcn 是 React+Tailwind 生态下的现代风格。

## 备选

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. 统一用 shadcn/ui Table** ✅ | 与设计规范 token 体系一致；包体积小；无外部样式覆盖 | 紧凑表格功能需手写（无内置 size="small"） |
| B. 混用 antd Table + shadcn/ui 其他 | antd 表格开箱即用（紧凑模式 / 排序 / 分页） | 视觉不一致；需处理两套样式共存；包体积大 |
| C. 改需求只用 antd | 表格功能强 | 与需求文档的 token 体系冲突（蓝色 hsl(221,83%,53%) 是 shadcn 范式） |

## 决策

**shadcn 风格手写组件**（不复用 shadcn CLI，按设计 token 自己实现）。Table 组件紧凑风格用 Tailwind className 实现（`h-9 px-2`、`text-xs font-medium`）。

## 后果

- ✅ 单一样式系统，无 antd `!important` 与 Tailwind utility 冲突
- ✅ 最终 gzip 包体 ~68KB（与单 antd table 组件差不多）
- ⚠️ 自写紧凑表格 ≈ 80 行代码；功能未来若超过"紧凑表格"范围（分页/筛选/排序），需评估升级
- ⚠️ Border-radius 等设计 token 必须与 `index.css` 的 CSS 变量保持一致（避免未来扩展时漂移）