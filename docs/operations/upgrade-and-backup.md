# 运维手册

## 日常维护

### 看运行状态

```bash
docker ps --filter name=supplier-quote
docker logs --tail 100 supplier-quote
docker stats supplier-quote  # 实时 CPU / 内存
```

### 重启 / 停服

```bash
docker compose restart          # 平滑重启（先 stop 再 up）
docker compose stop             # 停服
docker compose up -d            # 启动
```

### 进入容器调试

```bash
docker exec -it supplier-quote sh
# 容器内：
ls /app
ls dist/client                  # 前端构建产物
cat /app/.env 2>/dev/null || cat /proc/1/environ | tr '\0' '\n' | grep -E 'DATABASE|JWT'
```

### 数据库连接检查

```bash
docker exec 1Panel-postgresql-NSJt psql -U supplier_quote -d supplier_quote -c '\dt'
# 应列出 quotes / tenders / users / tender_invitations 4 张表
```

## 升级流程

```bash
cd /home/gdby/supplier-quote
git pull                          # 拉最新代码
docker compose up -d --build       # 重建镜像并启动
docker logs -f supplier-quote      # 跟踪启动日志
curl http://localhost:8090/api/health
```

新代码如包含 schema 变更，`drizzle-kit generate` 会在 commit 中产生新的 `drizzle/000N_*.sql`，容器启动时自动应用。

## 备份策略

### 数据库全量

```bash
docker exec 1Panel-postgresql-NSJt pg_dump -U supplier_quote -d supplier_quote -F c \
  > /backup/supplier-quote/supplier_quote_$(date +%Y%m%d).dump
```

### 上传对象（报价附件，本项目暂无）

不适用。

### 备份保留

- 每日：保留 7 天
- 每周：保留 4 周
- 季度归档

## 恢复演练

```bash
# 创建临时库
docker exec 1Panel-postgresql-NSJt psql -U user_crcW5z -c "CREATE DATABASE supplier_quote_restore OWNER supplier_quote;"
# 灌入备份
cat supplier_quote_20260917.dump | docker exec -i 1Panel-postgresql-NSJt pg_restore -U supplier_quote -d supplier_quote_restore
# 验证
docker exec 1Panel-postgresql-NSJt psql -U supplier_quote -d supplier_quote_restore -c "SELECT count(*) FROM users;"
```

## 监控告警（建议接入项）

- 容器健康：`docker ps` 检查 `STATUS` 是否 `Up` 且健康
- 日志关键字告警：`EADDRINUSE`、`FATAL`、`error`、`ECONNREFUSED`
- 5xx 错误率：Express 中间件记录（默认 `console.error`，可对接 Loki/ES）
- DB 连接：`DATABASE_URL` 不可达时 migrate 阶段就会失败，容器循环重启

## 手动清表（开发场景）

```bash
docker exec 1Panel-postgresql-NSJt psql -U user_crcW5z -d supplier_quote -c \
  "TRUNCATE tender_invitations, quotes, tenders, users CASCADE;"
```

⚠️ **生产禁止**：会清掉全部数据。

## 常见事故

### 1. 误删除邀请导致供应商看不到招标

历史报价在管理员账面上保留（设计如此）。如需恢复可见性，重新 `POST /api/admin/tenders/:id/invitations` 增补即可。

### 2. 截止时间已过但发现合同期有变

不可通过 PATCH 修改 deadline（已过截止锁）。**应急**：在数据库直接 UPDATE `tenders.deadline`，并调用 `POST /api/admin/tenders/:id/close` 后手动改回 `open` 与新 deadline。**优先**走完整流程重建招标。

### 3. JWT_SECRET 泄露

立刻修改 `.env` 的 `JWT_SECRET`，重启容器。**所有现有 token 失效**，需重新输入凭据。无数据风险。

### 4. Postgres 容器更换地址 / 网络

更新 `.env` 的 `DATABASE_URL`（开发用 `localhost`）与 `docker-compose.yml`（容器内 `@postgresql`）。重启容器。