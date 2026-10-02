import type { Request, RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { issuedBeforePasswordChange, verifyToken } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/http';

export interface AuthUser {
  id: number;
  role: Role;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

async function resolveUser(req: Request): Promise<AuthUser | undefined> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  const payload = verifyToken(header.slice(7));
  if (!payload) return undefined;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, email: true, name: true, isActive: true, passwordChangedAt: true },
  });
  if (!user || !user.isActive || issuedBeforePasswordChange(payload, user.passwordChangedAt)) return undefined;
  // A token minted for a customer must not gain admin rights if the role changes later, and vice versa.
  if (user.role !== payload.role) return undefined;
  return { id: user.id, role: user.role, email: user.email, name: user.name };
}

/** Attaches req.user when a valid token is present, but never rejects. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  req.user = await resolveUser(req);
  next();
};

export const requireAuth: RequestHandler = async (req, _res, next) => {
  req.user = await resolveUser(req);
  if (!req.user) throw unauthorized();
  next();
};

export const requireAdmin: RequestHandler = async (req, _res, next) => {
  req.user = await resolveUser(req);
  if (!req.user) throw unauthorized();
  if (req.user.role !== 'ADMIN') throw forbidden();
  next();
};

export function isAdmin(req: Request): boolean {
  return req.user?.role === 'ADMIN';
}
