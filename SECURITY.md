# 安全政策

## 报告漏洞

如发现安全问题，请通过 GitHub Issues 的 private vulnerability report 功能提交，或直接联系仓库所有者（barryzhang）。

**请勿在公开 Issue 中披露未修补的漏洞。**

## 支持的版本

| 版本 | 支持 |
|---|---|
| main 分支最新 | ✅ |
| 旧版本 | ❌ |

## 安全特性

- 密码用 Node 内置 scrypt 哈希（无原生依赖、内存硬）
- JWT 24h 过期，HS256 签名，`JWT_SECRET` 从环境变量注入
- SQL 全部通过 Drizzle ORM 参数化构建（无字符串拼接）
- 报价截止锁定：数据库事务内 `SELECT FOR UPDATE` + 服务器时间
- 数据隔离：服务端强制 supplier_id 守卫
- 邀请隔离：未受邀供应商对该招标视而不见
- 停用账号即使持有有效 token 也被 403 拦截

## 部署安全要求

- `.env` 不入 git（已 `.gitignore` 排除）
- `JWT_SECRET` 必须随机生成并妥善保管，**生产环境变更会让所有现有 token 失效**
- 数据库密码至少 24 字节随机 hex
- ufw 仅开 8090 端口（HTTP）；HTTPS 由前置反向代理提供（接入方式确定后再加）
- 容器 `restart: unless-stopped` + `1panel-network` 内部通信，不直接暴露 postgres

## 不在本项目范围内的安全考虑

- 暴力破解登录：本项目未做登录速率限制（内网工具规模）。如需可加 nginx `limit_req` 或 Express 中间件
- CSRF：纯 JWT + Authorization Header 协议，浏览器原生 SameSite/Origin 足够
- SQL 注入：未发现可注入路径（Drizzle 全程参数化）
- XSS：React 默认转义 + 不使用 `dangerouslySetInnerHTML`