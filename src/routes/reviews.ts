import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { badRequest, idParam, notFound, pagination, parse } from '../lib/http';
import { limiter } from '../lib/rateLimit';
import { requireAdmin, requireAuth } from '../middleware/auth';

export const reviewsRouter = Router();

const author = { select: { id: true, name: true } } as const;

/** "Nimali Perera" becomes "Nimali P." so public reviews don't publish customers' full names. */
function publicName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

const postLimiter = limiter(10, 15, 'Too many reviews in a short time. Please try again later.');

async function recomputeRating(productId: number) {
  const agg = await prisma.review.aggregate({
    where: { productId, approved: true },
    _avg: { rating: true },
    _count: true,
  });
  await prisma.product.update({
    where: { id: productId },
    data: {
      ratingAvg: new Prisma.Decimal(agg._avg.rating ?? 0).toDecimalPlaces(2),
      ratingCount: agg._count,
    },
  });
}

reviewsRouter.get('/', async (req, res) => {
  const productId = Number(req.query.productId);
  if (!Number.isInteger(productId) || productId <= 0) throw badRequest('productId is required');
  const { page, limit, skip } = pagination(req.query, { limit: 10, maxLimit: 50 });
  const where = { productId, approved: true };

  const [items, total, groups] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { user: author },
    }),
    prisma.review.count({ where }),
    prisma.review.groupBy({ by: ['rating'], where, _count: true }),
  ]);

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const g of groups) {
    distribution[g.rating] = g._count;
    sum += g.rating * g._count;
  }

  res.json({
    items: items.map(({ user, userId: _userId, ...r }) => ({ ...r, authorName: publicName(user.name) })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    summary: { average: total ? Number((sum / total).toFixed(2)) : 0, count: total, distribution },
  });
});

reviewsRouter.get('/mine', requireAuth, async (req, res) => {
  const productId = Number(req.query.productId);
  if (!Number.isInteger(productId)) throw badRequest('productId is required');
  const review = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId: req.user!.id } },
  });
  res.json({ review });
});

const reviewSchema = z.object({
  productId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(160).optional(),
  comment: z.string().trim().max(3000).optional(),
});

reviewsRouter.post('/', postLimiter, requireAuth, async (req, res) => {
  const data = parse(reviewSchema, req.body);
  const product = await prisma.product.findUnique({ where: { id: data.productId }, select: { id: true } });
  if (!product) throw notFound('Product not found');

  const fields = { rating: data.rating, title: data.title || null, comment: data.comment || null, approved: false };
  const review = await prisma.review.upsert({
    where: { productId_userId: { productId: data.productId, userId: req.user!.id } },
    create: { ...fields, productId: data.productId, userId: req.user!.id },
    update: fields,
  });
  // An edited review goes back to moderation, so the public rating may change.
  await recomputeRating(data.productId);
  res.status(201).json({ review });
});

// ----- Admin -----

reviewsRouter.get('/admin', requireAdmin, async (req, res) => {
  const { page, limit, skip } = pagination(req.query, { limit: 20, maxLimit: 100 });
  const status = String(req.query.status ?? 'pending');
  const where: Prisma.ReviewWhereInput =
    status === 'approved' ? { approved: true } : status === 'all' ? {} : { approved: false };

  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { user: { select: { id: true, name: true, email: true } }, product: { select: { id: true, name: true, slug: true } } },
    }),
    prisma.review.count({ where }),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

reviewsRouter.patch('/admin/:id', requireAdmin, async (req, res) => {
  const { approved } = parse(z.object({ approved: z.boolean() }), req.body);
  const review = await prisma.review.update({ where: { id: idParam(req) }, data: { approved } });
  await recomputeRating(review.productId);
  res.json({ review });
});

reviewsRouter.delete('/admin/:id', requireAdmin, async (req, res) => {
  const review = await prisma.review.delete({ where: { id: idParam(req) } });
  await recomputeRating(review.productId);
  res.status(204).end();
});
