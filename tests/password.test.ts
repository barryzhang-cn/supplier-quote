import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../server/auth/password';

describe('password', () => {
  it('正确密码验证通过', () => {
    const hash = hashPassword('Passw0rd!123');
    expect(verifyPassword('Passw0rd!123', hash)).toBe(true);
  });

  it('错误密码验证失败', () => {
    const hash = hashPassword('Passw0rd!123');
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('同一密码两次哈希产生不同 salt（防彩虹表）', () => {
    expect(hashPassword('abc')).not.toBe(hashPassword('abc'));
  });

  it('格式损坏的 hash 返回 false 而不是抛异常', () => {
    expect(verifyPassword('abc', 'garbage')).toBe(false);
  });
});
