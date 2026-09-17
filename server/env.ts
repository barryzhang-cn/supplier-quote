export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`环境变量 ${name} 未配置`);
  return v;
}

/**
 * 系统内置管理员用户名。受保护账号：列表隐藏 / 禁止修改 / 禁止删除。
 * 默认 'admin'，可通过 SYSTEM_ADMIN_USERNAME 覆盖。
 */
export function systemAdminUsername(): string {
  return (process.env.SYSTEM_ADMIN_USERNAME ?? 'admin').trim();
}