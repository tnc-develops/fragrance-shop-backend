import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { Router, type Request } from 'express';
import { Prisma, type OrderStatus, type PaymentMethod, type PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, HttpError, idParam, notFound, pagination, parse } from '../lib/http';
import { getSettings } from '../lib/settings';
import { optionalAuth, requireAdmin, requireAuth } from '../middleware/auth';
import { privateFilePath, toPrivatePath, uploadSlip } from '../middleware/upload';
import { limiter } from '../lib/rateLimit';
import { buildQuote } from '../services/pricing';
import { getPaymentOptions, getPaymentProvider, requireAvailableOption } from '../services/payment';
import { syncProductSummaries } from '../services/variants';
import { linesSchema } from './cart';

export const ordersRouter = Router();

const STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
const PAYMENT_METHODS = ['COD', 'BANK_TRANSFER', 'CARD'] as const;
const CUSTOMER_CANCELLABLE: OrderStatus[] = ['PENDING', 'CONFIRMED'];

const orderInclude = {
  items: true,
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const createSchema = z.object({
  items: linesSchema.min(1, 'Your cart is empty'),
  customerName: text(2, 120),
  email: z.email().max(191).transform((v) => v.trim().toLowerCase()),
  phone: text(5, 30),
  addressLine1: text(3, 255),
  addressLine2: z.string().trim().max(255).optional(),
  city: text(2, 120),
  state: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: text(2, 80),
  notes: z.string().trim().max(2000).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('COD'),
});

function generateOrderNumber(): string {
  const d = new Date();
  const date = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = Array.from(crypto.randomBytes(5), (b) => alphabet[b % alphabet.length]).join('');
  return `FBS-${date}-${rand}`;
}

async function restock(tx: Prisma.TransactionClient, orderId: number) {
  const items = await tx.orderItem.findMany({ where: { orderId, variantId: { not: null } } });
  const touched: number[] = [];
  for (const item of items) {
    const variant = await tx.productVariant.update({
      where: { id: item.variantId! },
      data: { stock: { increment: item.quantity } },
      select: { productId: true },
    });
    touched.push(variant.productId);
  }
  await syncProductSummaries(touched, tx);
}

// Ownership is by account only: emails are not verified, so matching on email would expose guest orders.
function canView(req: Request, order: { userId: number | null }) {
  if (!req.user) return false;
  return req.user.role === 'ADMIN' || order.userId === req.user.id;
}

/** What customers may see of an order: the slip's storage path stays server-side. */
function customerOrder<T extends { paymentSlip: string | null }>({ paymentSlip: _slip, ...order }: T) {
  return order;
}

const placeLimiter = limiter(15, 15, 'Too many orders from this connection. Please wait a few minutes or contact us.');
const lookupLimiter = limiter(30, 15, 'Too many order lookups. Please wait a few minutes and try again.');
const slipLimiter = limiter(10, 15, 'Too many slip uploads. Please wait a few minutes or send the slip on WhatsApp.');

ordersRouter.post('/', placeLimiter, optionalAuth, async (req, res) => {
  const data = parse(createSchema, req.body);
  const settings = await getSettings();
  await requireAvailableOption(data.paymentMethod);
  const provider = getPaymentProvider(data.paymentMethod);

  const order = await prisma.$transaction(async (tx) => {
    const quote = await buildQuote(data.items, settings, tx);
    if (quote.hasIssues) {
      throw new HttpError(409, 'Some items in your cart need attention', {
        lines: quote.lines.filter((l) => l.issue).map((l) => ({ variantId: l.variantId, issue: l.issue })),
        missingVariantIds: quote.missingVariantIds,
      });
    }
    if (!quote.lines.length) throw badRequest('Your cart is empty');

    for (const line of quote.lines) {
      // Conditional decrement guards against two customers buying the last unit at once.
      const { count } = await tx.productVariant.updateMany({
        where: { id: line.variantId, isActive: true, stock: { gte: line.quantity } },
        data: { stock: { decrement: line.quantity } },
      });
      if (count === 0) {
        const name = line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name;
        throw conflict(`${name} just sold out. Please review your cart.`);
      }
    }
    await syncProductSummaries(quote.lines.map((l) => l.productId), tx);

    const { items: _items, paymentMethod, ...customer } = data;
    return tx.order.create({
      data: {
        ...customer,
        addressLine2: customer.addressLine2 || null,
        state: customer.state || null,
        postalCode: customer.postalCode || null,
        notes: customer.notes || null,
        orderNumber: generateOrderNumber(),
        userId: req.user?.id ?? null,
        paymentMethod,
        subtotal: quote.subtotal,
        shippingFee: quote.shippingFee,
        total: quote.total,
        currency: quote.currency,
        items: {
          create: quote.lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            name: l.name,
            variantLabel: l.variantLabel,
            image: l.image,
            price: l.price,
            quantity: l.quantity,
          })),
        },
        events: {
          create: {
            status: 'PENDING',
            note: paymentMethod === 'BANK_TRANSFER' ? 'Order placed, awaiting bank transfer' : 'Order placed',
          },
        },
      },
      include: orderInclude,
    });
  });

  const payment = await provider.initiate(order);
  if (payment.status !== order.paymentStatus) {
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: payment.status } });
    order.paymentStatus = payment.status;
  }

  if (req.user) await prisma.cartItem.deleteMany({ where: { userId: req.user.id } });

  res.status(201).json({ order: customerOrder(order), payment: { redirectUrl: payment.redirectUrl ?? null } });
});

ordersRouter.get('/mine', requireAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    include: orderInclude,
  });
  res.json({ items: orders.map(customerOrder) });
});

/** Public tracking for guests: requires the order number and the email used at checkout. */
ordersRouter.get('/track', lookupLimiter, async (req, res) => {
  const orderNumber = String(req.query.orderNumber ?? '').trim().toUpperCase();
  const email = String(req.query.email ?? '').trim().toLowerCase();
  if (!orderNumber || !email) throw badRequest('Order number and email are required');

  const order = await prisma.order.findUnique({ where: { orderNumber }, include: orderInclude });
  if (!order || order.email !== email) throw notFound('No order matches those details');
  res.json({ order: customerOrder(order) });
});

// ----- Admin -----

ordersRouter.get('/admin', requireAdmin, async (req, res) => {
  const { page, limit, skip } = pagination(req.query, { limit: 20, maxLimit: 100 });
  const where: Prisma.OrderWhereInput = {};
  const status = String(req.query.status ?? '');
  if ((STATUSES as readonly string[]).includes(status)) where.status = status as OrderStatus;
  const method = String(req.query.paymentMethod ?? '');
  if ((PAYMENT_METHODS as readonly string[]).includes(method)) where.paymentMethod = method as PaymentMethod;
  if (req.query.slip === 'review') {
    Object.assign(where, { paymentMethod: 'BANK_TRANSFER', paymentStatus: 'PENDING', paymentSlip: { not: null }, status: { not: 'CANCELLED' } });
  }
  const search = String(req.query.search ?? '').trim();
  if (search) {
    where.OR = [
      { orderNumber: { contains: search } },
      { customerName: { contains: search } },
      { email: { contains: search } },
      { phone: { contains: search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { _count: { select: { items: true } } },
    }),
    prisma.order.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

ordersRouter.get('/admin/:id', requireAdmin, async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: idParam(req) },
    include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } },
  });
  if (!order) throw notFound('Order not found');
  res.json({ order });
});

ordersRouter.get('/admin/:id/slip', requireAdmin, async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: idParam(req) }, select: { paymentSlip: true } });
  const file = order?.paymentSlip ? privateFilePath(order.paymentSlip) : null;
  if (!file) throw notFound('No payment slip for this order');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(file, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Payment slip file is missing' });
  });
});

const PAYMENT_NOTES: Record<PaymentStatus, string> = {
  PENDING: 'Payment marked as pending',
  PAID: 'Payment received',
  FAILED: 'Payment could not be confirmed',
  REFUNDED: 'Payment refunded',
};

const adminUpdateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
  note: z.string().trim().max(500).optional(),
});

ordersRouter.patch('/admin/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const { status, paymentStatus, note } = parse(adminUpdateSchema, req.body);

  const order = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id } });
    if (!current) throw notFound('Order not found');

    const data: Prisma.OrderUpdateInput = {};
    if (paymentStatus) data.paymentStatus = paymentStatus;

    if (status && status !== current.status) {
      if (current.status === 'CANCELLED') throw badRequest('Cancelled orders cannot be reopened');
      data.status = status;
      if (status === 'CANCELLED') await restock(tx, id);
      if (status === 'DELIVERED' && current.paymentMethod === 'COD' && !paymentStatus) data.paymentStatus = 'PAID';
      data.events = { create: { status, note: note || null } };
    } else if (note) {
      data.events = { create: { status: current.status, note } };
    } else if (paymentStatus && paymentStatus !== current.paymentStatus) {
      data.events = { create: { status: current.status, note: PAYMENT_NOTES[paymentStatus] } };
    }

    return tx.order.update({ where: { id }, data, include: orderInclude });
  });

  res.json({ order });
});

// ----- Customer (must come after the static routes above) -----

ordersRouter.get('/:orderNumber', requireAuth, async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { orderNumber: String(req.params.orderNumber).toUpperCase() },
    include: orderInclude,
  });
  if (!order || !canView(req, order)) throw notFound('Order not found');
  res.json({ order: customerOrder(order) });
});

/** Bank transfer slip from the customer: signed in as the buyer, or a guest sending the order email in `email`. */
ordersRouter.post('/:orderNumber/slip', slipLimiter, optionalAuth, uploadSlip('slip'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('Choose a photo or PDF of your payment slip');

  try {
    const orderNumber = String(req.params.orderNumber).toUpperCase();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const current = await prisma.order.findUnique({ where: { orderNumber } });
    if (!current || !(canView(req, current) || (email && email === current.email))) throw notFound('Order not found');
    if (current.paymentMethod !== 'BANK_TRANSFER') throw badRequest('This order is not paid by bank transfer');
    if (current.status === 'CANCELLED') throw badRequest('This order has been cancelled');
    if (current.paymentStatus === 'PAID') throw badRequest('This order is already marked as paid');
    const option = (await getPaymentOptions()).find((o) => o.method === 'BANK_TRANSFER');
    if (!option?.allowSlipUpload) throw badRequest('Slip uploads are turned off. Please send your slip on WhatsApp.');

    const order = await prisma.order.update({
      where: { id: current.id },
      data: {
        paymentSlip: toPrivatePath(file.path),
        paymentSlipUploadedAt: new Date(),
        events: { create: { status: current.status, note: current.paymentSlip ? 'Payment slip replaced' : 'Payment slip uploaded' } },
      },
      include: orderInclude,
    });

    const previous = current.paymentSlip ? privateFilePath(current.paymentSlip) : null;
    if (previous) await fs.unlink(previous).catch(() => {});
    res.json({ order: customerOrder(order) });
  } catch (err) {
    await fs.unlink(file.path).catch(() => {});
    throw err;
  }
});

const cancelSchema = z.object({ email: z.email().optional(), reason: z.string().trim().max(300).optional() });

ordersRouter.post('/:orderNumber/cancel', lookupLimiter, optionalAuth, async (req, res) => {
  const { email, reason } = parse(cancelSchema, req.body ?? {});
  const orderNumber = String(req.params.orderNumber).toUpperCase();

  const order = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { orderNumber } });
    const allowed = current && (canView(req, current) || (email && email.toLowerCase() === current.email));
    if (!current || !allowed) throw notFound('Order not found');
    if (!CUSTOMER_CANCELLABLE.includes(current.status)) {
      throw badRequest('This order can no longer be cancelled. Please contact us.');
    }
    await restock(tx, current.id);
    return tx.order.update({
      where: { id: current.id },
      data: {
        status: 'CANCELLED',
        events: { create: { status: 'CANCELLED', note: reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer' } },
      },
      include: orderInclude,
    });
  });

  res.json({ order: customerOrder(order) });
});
