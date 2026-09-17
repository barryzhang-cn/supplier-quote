export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`环境变量 ${name} 未配置`);
  return v;
}
