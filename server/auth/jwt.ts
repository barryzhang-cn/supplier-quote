import jwt from 'jsonwebtoken';

export type Role = 'admin' | 'supplier';

export interface TokenPayload {
  sub: string;
  role: Role;
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET 未配置或长度不足 16');
  return s;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: '24h' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret());
    if (typeof decoded === 'string') return null;
    const { sub, role } = decoded as jwt.JwtPayload;
    if (typeof sub !== 'string' || (role !== 'admin' && role !== 'supplier')) return null;
    return { sub, role };
  } catch {
    return null;
  }
}
