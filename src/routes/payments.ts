import { Router } from 'express';
import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { badRequest, notFound, parse } from '../lib/http';
import { requireAdmin } from '../middleware/auth';
import { getPaymentOptions, hasProvider, isAvailable, publicPaymentOption } from '../services/payment';

export const paymentsRouter = Router();

const methodParam = (value: unknown): PaymentMethod => {
  const method = String(value).toUpperCase();
  if (!(method in PaymentMethod)) throw notFound('Unknown payment method');
  return method as PaymentMethod;
};

const optional = (max: number) => z.string().trim().max(max).nullable().optional();

const updateSchema = z.object({
  name: z.string().trim().min(1, 'Add a name').max(80).optional(),
  description: optional(300),
  instructions: optional(2000),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100).optional(),
  bankAccounts: z
    .array(
      z.object({
        bankName: z.string().trim().min(1, 'Add the bank name').max(120),
        accountName: z.string().trim().min(1, 'Add the account name').max(120),
        accountNumber: z.string().trim().min(1, 'Add the account number').max(60),
        branch: z.string().trim().max(120).nullable().optional(),
      }),
    )
    .max(5)
    .optional(),
  allowSlipUpload: z.boolean().optional(),
  allowWhatsappSlip: z.boolean().optional(),
});

/** Methods customers can choose at checkout. */
paymentsRouter.get('/', async (_req, res) => {
  const options = await getPaymentOptions();
  res.json({ items: options.filter(isAvailable).map(publicPaymentOption) });
});

paymentsRouter.get('/admin', requireAdmin, async (_req, res) => {
  const options = await getPaymentOptions();
  res.json({ items: options.map((o) => ({ ...o, canActivate: hasProvider(o.method) })) });
});

paymentsRouter.patch('/admin/:method', requireAdmin, async (req, res) => {
  const method = methodParam(req.params.method);
  const data = parse(updateSchema, req.body);
  const options = await getPaymentOptions();
  const current = options.find((o) => o.method === method)!;
  const next = { ...current, ...data };

  if (next.isActive && !hasProvider(method)) {
    throw badRequest('Card payments need a payment gateway connected on the server before they can be turned on');
  }
  if (next.isActive && method === 'BANK_TRANSFER' && !(next.bankAccounts as unknown[] | null)?.length) {
    throw badRequest('Add at least one bank account before turning on bank transfer');
  }
  if (!next.isActive && !options.some((o) => o.method !== method && isAvailable(o))) {
    throw badRequest('Keep at least one payment method turned on so customers can check out');
  }

  const option = await prisma.paymentOption.update({ where: { method }, data });
  res.json({ option: { ...option, canActivate: hasProvider(method) } });
});

/** Any method's public details, so an order page can show bank details even if the method was later turned off. */
paymentsRouter.get('/:method', async (req, res) => {
  const method = methodParam(req.params.method);
  const option = (await getPaymentOptions()).find((o) => o.method === method);
  if (!option) throw notFound('Unknown payment method');
  res.json({ option: publicPaymentOption(option) });
});
