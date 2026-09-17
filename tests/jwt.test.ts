import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { signToken, verifyToken } from '../server/auth/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
});

describe('jwt', () => {
  it('sign 后 verify 返回原 payload', () => {
    const token = signToken({ sub: 'u-1', role: 'supplier' });
    expect(verifyToken(token)).toEqual({ sub: 'u-1', role: 'supplier' });
  });

  it('过期 token 返回 null', () => {
    const token = jwt.sign({ sub: 'u-1', role: 'admin' }, process.env.JWT_SECRET!, {
      expiresIn: '-10s',
    });
    expect(verifyToken(token)).toBeNull();
  });

  it('篡改的 token 返回 null', () => {
    const token = signToken({ sub: 'u-1', role: 'supplier' });
    expect(verifyToken(token + 'x')).toBeNull();
  });

  it('role 非法返回 null', () => {
    const token = jwt.sign({ sub: 'u-1', role: 'hacker' }, process.env.JWT_SECRET!, {
      expiresIn: '1h',
    });
    expect(verifyToken(token)).toBeNull();
  });
});
