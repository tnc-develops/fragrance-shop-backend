import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { badRequest, idParam, pagination, parse } from '../lib/http';
import { requireAdmin } from '../middleware/auth';
import { variantLabel } from '../services/variants';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

const LOW_STOCK = 5;
const SALES_DAYS = 14;

/** Calendar day in the server's timezone (toISOString would shift days by the UTC offset). */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

adminRouter.get('/stats', async (_req, res) => {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (SALES_DAYS - 1));

  const notCancelled = { status: { not: 'CANCELLED' as const } };

  const [revenue, orderCount, pendingOrders, slipsToReview, productCount, customers, pendingReviews, lowVariants, recentOrders, recent] =
    await Promise.all([
      prisma.order.aggregate({ where: notCancelled, _sum: { total: true } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({
        where: { ...notCancelled, paymentMethod: 'BANK_TRANSFER', paymentStatus: 'PENDING', paymentSlip: { not: null } },
      }),
      prisma.product.count(),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.review.count({ where: { approved: false } }),
      prisma.productVariant.findMany({
        where: { isActive: true, stock: { lte: LOW_STOCK }, product: { isActive: true } },
        orderBy: [{ stock: 'asc' }, { id: 'asc' }],
        take: 6,
        select: {
          id: true,
          stock: true,
          sizeMl: true,
          label: true,
          product: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, orderNumber: true, customerName: true, total: true, currency: true, status: true, createdAt: true },
      }),
      prisma.order.findMany({
        where: { ...notCancelled, createdAt: { gte: since } },
        select: { total: true, createdAt: true },
      }),
    ]);

  const byDay = new Map<string, { date: string; revenue: Prisma.Decimal; orders: number }>();
  for (let i = 0; i < SALES_DAYS; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = dayKey(d);
    byDay.set(key, { date: key, revenue: new Prisma.Decimal(0), orders: 0 });
  }
  for (const o of recent) {
    const bucket = byDay.get(dayKey(o.createdAt));
    if (bucket) {
      bucket.revenue = bucket.revenue.add(o.total);
      bucket.orders += 1;
    }
  }

  const lowStock = lowVariants.map((v) => ({
    id: v.product.id,
    variantId: v.id,
    name: v.product.name,
    variantLabel: variantLabel(v),
    slug: v.product.slug,
    stock: v.stock,
  }));

  res.json({
    revenue: revenue._sum.total ?? 0,
    orderCount,
    pendingOrders,
    slipsToReview,
    productCount,
    customers,
    pendingReviews,
    lowStock,
    recentOrders,
    salesByDay: [...byDay.values()],
  });
});

adminRouter.get('/customers', async (req, res) => {
  const { page, limit, skip } = pagination(req.query, { limit: 20, maxLimit: 100 });
  const search = String(req.query.search ?? '').trim();
  const where: Prisma.UserWhereInput = {
    role: 'CUSTOMER',
    ...(search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

adminRouter.patch('/customers/:id', async (req, res) => {
  const id = idParam(req);
  if (id === req.user!.id) throw badRequest('You cannot change your own account here');
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  const user = await prisma.user.update({
    where: { id },
    data: { isActive },
    select: { id: true, isActive: true },
  });
  res.json({ user });
});
