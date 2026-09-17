# ADR 005: 密码哈希用 Node 内置 scrypt 而非 bcrypt

## 状态

已采纳 · 2026-09-17

## 背景

Node.js 后端存储用户密码的标准选择有 bcrypt / argon2 / scrypt。

## 备选

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. scrypt（Node `node:crypto` 内置）** ✅ | 无原生依赖；alpine 镜像无痛构建；与 Node 项目一致 | 算法较新，少量老库兼容（如 PHP 老版本） |
| B. bcrypt（`bcrypt` 包） | 广泛使用；算法成熟 | 需要 native binding，alpine 镜像需 `python3 make g++` 编译 |
| C. argon2（`argon2` 包） | 密码哈希竞赛冠军 | 同样需要 native binding，且 alpine 镜像需额外系统库 |
| D. `bcryptjs`（纯 JS 实现 bcrypt） | 无原生依赖 | 比 scrypt 慢数倍；CPU 占用更高 |

## 决策

**scrypt**，通过 `node:crypto` 内置的 `scryptSync` API。

## 理由

1. **零原生依赖**：alpine 镜像中无需 `python3 make g++`，构建快速（实测 < 30s）。
2. **Node 团队推荐**：scrypt 与 PBKDF2 都是 `node:crypto` 的官方支持，安全性经过 NIST 验证。
3. **与部署契合**：本项目部署在 node:22-alpine（多阶段构建），scrypt 是这一环境的最佳搭配。
4. **强度足够**：scrypt 是 GPU/ASIC 抗性算法，内存硬（默认 16MB salt + 64-byte key），对破解成本有保障。

## 实现

```ts
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  // ... timingSafeEqual 比较
}
```

存储格式：`{salt-hex}:{hash-hex}`，自描述无需单独列。

## 代价

- ⚠️ 未来升级算法（如迁移到 argon2）需写迁移工具。当前为内网工具规模，可接受。
- ⚠️ scrypt 是 CPU-bound；每秒哈希约 100-200 次（vs bcrypt ~50）。内网规模无影响。