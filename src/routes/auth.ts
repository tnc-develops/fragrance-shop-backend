import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { publicUser, signToken } from '../lib/auth';
import { badRequest, conflict, forbidden, parse, unauthorized } from '../lib/http';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in a few minutes' },
});

/** Failed admin sign-ins only; a correct password is never blocked by earlier typos once the window passes. */
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.' },
});

/** Compared against when the email is unknown, so response time doesn't reveal which emails have accounts. */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const email = z.email().max(191).transform((v) => v.trim().toLowerCase());
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  password,
  phone: z.string().trim().max(30).optional(),
});

const loginSchema = z.object({ email, password: z.string().min(1).max(128) });

async function login(body: unknown, requireAdminRole: boolean) {
  const { email, password } = parse(loginSchema, body);
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw unauthorized('Invalid email or password');
  if (!user.isActive) throw forbidden('This account has been disabled');
  if (requireAdminRole && user.role !== 'ADMIN') throw forbidden('Admin access required');
  return { token: signToken(user), user: publicUser(user) };
}

authRouter.post('/register', authLimiter, async (req, res) => {
  const data = parse(registerSchema, req.body);
  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) throw conflict('An account with this email already exists');

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      passwordHash: await bcrypt.hash(data.password, 12),
    },
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  res.json(await login(req.body, false));
});

authRouter.post('/admin/login', adminLoginLimiter, async (req, res) => {
  res.json(await login(req.body, true));
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ user: publicUser(user) });
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const data = parse(profileSchema, req.body);
  const user = await prisma.user.update({ where: { id: req.user!.id }, data });
  res.json({ user: publicUser(user) });
});

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

authRouter.post('/change-password', requireAuth, authLimiter, async (req, res) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw badRequest('Current password is incorrect');
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12), passwordChangedAt: new Date() },
  });
  // Other devices are signed out; this one gets a fresh token.
  res.json({ ok: true, token: signToken(updated) });
});
