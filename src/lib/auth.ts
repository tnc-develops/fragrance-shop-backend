import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role, User } from '@prisma/client';
import { env } from '../config/env';

export interface TokenPayload {
  sub: number;
  role: Role;
  /** Issued-at, in seconds. */
  iat: number;
}

export function signToken(user: Pick<User, 'id' | 'role'>): string {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.id),
    expiresIn: (user.role === 'ADMIN' ? env.ADMIN_JWT_EXPIRES_IN : env.JWT_EXPIRES_IN) as SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const sub = Number(decoded.sub);
    if (!Number.isInteger(sub) || (decoded.role !== 'ADMIN' && decoded.role !== 'CUSTOMER')) return null;
    return { sub, role: decoded.role, iat: Number(decoded.iat) || 0 };
  } catch {
    return null;
  }
}

/** True when the token was issued before the user's last password change (1 s grace for same-second re-login). */
export function issuedBeforePasswordChange(payload: TokenPayload, passwordChangedAt: Date | null): boolean {
  return !!passwordChangedAt && payload.iat * 1000 < passwordChangedAt.getTime() - 1000;
}

export function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };
}
