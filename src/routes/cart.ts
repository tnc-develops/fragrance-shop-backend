import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { parse } from '../lib/http';
import { getSettings } from '../lib/settings';
import { requireAuth } from '../middleware/auth';
import { buildQuote, normalizeLines, type LineInput } from '../services/pricing';

export const cartRouter = Router();

export const linesSchema = z
  .array(
    z.object({
      variantId: z.number().int().positive(),
      quantity: z.number().int().min(0).max(99),
    }),
  )
  .max(100);

const bodySchema = z.object({ items: linesSchema });

async function cartResponse(userId: number) {
  const rows = await prisma.cartItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { variantId: true, quantity: true },
  });
  const quote = await buildQuote(rows, await getSettings());
  return { items: rows, quote };
}

async function replaceCart(userId: number, items: LineInput[]) {
  const lines = normalizeLines(items);
  const existing = await prisma.productVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    select: { id: true, productId: true },
  });
  const productOf = new Map(existing.map((v) => [v.id, v.productId]));

  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { userId } }),
    prisma.cartItem.createMany({
      data: lines
        .filter((l) => productOf.has(l.variantId))
        .map((l) => ({ userId, variantId: l.variantId, productId: productOf.get(l.variantId)!, quantity: l.quantity })),
    }),
  ]);
}

/** Public: prices any list of lines (used for guest carts and checkout summaries). */
cartRouter.post('/quote', async (req, res) => {
  const { items } = parse(bodySchema, req.body);
  res.json({ quote: await buildQuote(items, await getSettings()) });
});

cartRouter.get('/', requireAuth, async (req, res) => {
  res.json(await cartResponse(req.user!.id));
});

cartRouter.put('/', requireAuth, async (req, res) => {
  const { items } = parse(bodySchema, req.body);
  await replaceCart(req.user!.id, items);
  res.json(await cartResponse(req.user!.id));
});

/** Merges a guest cart into the saved cart after login (quantities are added, capped at 99). */
cartRouter.post('/merge', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { items } = parse(bodySchema, req.body);
  const saved = await prisma.cartItem.findMany({ where: { userId }, select: { variantId: true, quantity: true } });
  const merged = normalizeLines([...saved, ...items]).map((l) => ({ ...l, quantity: Math.min(l.quantity, 99) }));
  await replaceCart(userId, merged);
  res.json(await cartResponse(userId));
});
