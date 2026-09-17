# 部署指南

## 部署架构

```
┌─ 1panel-network (docker 网络) ──────────────────────┐
│                                                     │
│  浏览器 ──HTTP :8090──► supplier-quote 容器          │
│                        (node:22-alpine)             │
│                        ├─ Express API (/api/*)      │
│                        └─ 静态文件 (Vite build)      │
│                              │ DATABASE_URL          │
│                              ▼                       │
│                        1Panel-postgresql            │
│                        (postgres:18.6-alpine)       │
│                        database: supplier_quote     │
└─────────────────────────────────────────────────────┘
```

容器与 Postgres **通过 docker 网络通信**（不走宿主机防火墙），DATABASE_URL 使用容器别名 `postgresql`。仅 HTTP 端口 8090 通过宿主机 ufw 暴露。

## 前置条件

1. 已安装 Docker / Docker Compose
2. 已存在 `1panel-network` docker 网络
3. 已存在 1Panel postgres 容器（默认名 `1Panel-postgresql-NSJt`），版本 ≥ 15
4. 宿主机防火墙可被 `sudo ufw` 修改

## 部署步骤

### 1. 创建数据库角色与库

在 1Panel postgres 内创建专用角色与库（**仅需执行一次**）：

```bash
SUP_DB_PASS=$(openssl rand -hex 24)
echo "$SUP_DB_PASS"  # 记下，下一步填入 .env 的 DB_PASSWORD

# 用超级用户连接（1Panel 默认超级用户是 user_crcW5z 或 postgres）
docker exec 1Panel-postgresql-NSJt psql -U <超级用户> -c \
  "CREATE ROLE supplier_quote LOGIN PASSWORD '$SUP_DB_PASS';"
docker exec 1Panel-postgresql-NSJt psql -U <超级用户> -c \
  "CREATE DATABASE supplier_quote OWNER supplier_quote;"
docker exec 1Panel-postgresql-NSJt psql -U <超级用户> -c \
  "CREATE DATABASE supplier_quote_test OWNER supplier_quote;"  # 仅本地测试用，prod 可省
```

### 2. 配置 `.env`

项目根目录的 `.env`（**不入 git**）：

```env
DB_PASSWORD=<SUP_DB_PASS>           # 上面生成的数据库密码
JWT_SECRET=<openssl rand -hex 24>   # 任意 48 位 hex，**生产不能改**
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<初始管理员密码，≥8 位>  # 仅首次启动生效
```

`docker-compose.yml` 会自动从 `DB_PASSWORD` 拼出容器内的 `DATABASE_URL`：

```yaml
DATABASE_URL: postgres://supplier_quote:${DB_PASSWORD}@postgresql:5432/supplier_quote
```

### 3. 启动容器

```bash
docker compose up -d --build
```

容器首次启动会自动：
1. 跑 drizzle 迁移（建表 + 索引）
2. 读 `ADMIN_USERNAME`/`ADMIN_PASSWORD` seed 初始管理员（仅在没有任何 admin 时）
3. 监听 `:3000`，对外暴露宿主机 `:8090`

### 4. 开放防火墙

```bash
sudo ufw allow 8090/tcp comment 'supplier-quote'
```

### 5. 验证

```bash
curl http://localhost:8090/api/health                 # {"ok":true}
curl -X POST http://localhost:8090/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}'  # 返回 token
```

浏览器访问 `http://<服务器IP>:8090`，用 `admin` / `<ADMIN_PASSWORD>` 登录。

## 升级

```bash
cd /home/gdby/supplier-quote
git pull
docker compose up -d --build
```

容器启动时自动跑迁移（drizzle 跟踪已执行的迁移），无需手工 SQL。

## 备份

`supplier_quote` 库数据量很小，纳入 1Panel 现有 postgres 备份策略即可。建议每周全量备份 + 每日增量。

```bash
# 全量示例
docker exec 1Panel-postgresql-NSJt pg_dump -U supplier_quote -d supplier_quote -F c \
  > supplier_quote_$(date +%Y%m%d).dump
```

## 回滚到上一版本

```bash
git log --oneline              # 找到上一个 commit hash
git checkout <prev-commit>
docker compose up -d --build
```

如需回滚数据库迁移：drizzle 生成的 SQL 是单向的（不自动 down）。需要手动写反向 SQL 并执行，或在测试环境先演练。

## 故障排查

| 现象 | 检查 |
|---|---|
| 容器反复重启 | `docker logs supplier-quote`，通常是 `JWT_SECRET` 长度 < 16 或 `DB_PASSWORD` 错 |
| `EADDRINUSE :::3000` | 宿主机其他进程占 3000。docker-compose 已用 8090 映射；端口映射没问题，**重启宿主机时 3000 可能被抢占**。改 `EXPOSE` 不需要改，因为容器内只听 3000 |
| `relation "xxx" does not exist` | 迁移未执行；`docker exec supplier-quote npx tsx server/db/migrate.ts` |
| 浏览器看不到页面 | `curl http://localhost:8090/api/health`；`ufw status`；`docker logs supplier-quote` |
| 登录失败 | 确认 `.env` 的 `ADMIN_PASSWORD` 是否与首次启动时一致；**改 .env 后 `ADMIN_PASSWORD` 不会影响已 seed 的账号** |
| supplier 接口 404 | 邀请隔离生效。管理员视角应能在榜单看到该报价，但 supplier 看不到自己被移除后的招标 |