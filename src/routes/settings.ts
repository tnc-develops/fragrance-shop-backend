import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { imagePathSchema, parse, webUrlSchema } from '../lib/http';
import { getSettings, SETTINGS_ID } from '../lib/settings';
import { requireAdmin } from '../middleware/auth';

export const settingsRouter = Router();

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color like #C9A66B');
const optional = (max: number) => z.string().trim().max(max).nullable().optional();

const settingsSchema = z.object({
  shopName: z.string().trim().min(1).max(120).optional(),
  tagline: optional(200),
  logoLightUrl: imagePathSchema().nullable().optional(),
  logoDarkUrl: imagePathSchema().nullable().optional(),
  announcement: optional(300),
  currency: z.string().trim().min(1).max(8).optional(),
  currencySymbol: z.string().trim().min(1).max(8).optional(),
  shippingFee: z.number().nonnegative().optional(),
  freeShippingThreshold: z.number().nonnegative().nullable().optional(),
  heroIntervalMs: z.number().int().min(2000).max(30000).optional(),
  contactEmail: optional(191),
  contactPhone: optional(30),
  whatsappNumber: optional(30),
  openingHours: optional(200),
  address: optional(300),
  instagramUrl: webUrlSchema().nullable().optional(),
  facebookUrl: webUrlSchema().nullable().optional(),
  metaDescription: optional(300),
  seoTitle: optional(160),
  seoKeywords: optional(2000),
  googleVerification: z
    .string()
    .trim()
    .max(120)
    .regex(/^[A-Za-z0-9_-]*$/, 'Paste only the code from the content="..." part of the Google tag')
    .nullable()
    .optional(),
  seoIntroHeading: optional(160),
  seoIntroText: optional(3000),
  colors: z
    .object({ ivory: hex, charcoal: hex, gold: hex, taupe: hex, text: hex, espresso: hex })
    .optional(),
});

settingsRouter.get('/', async (_req, res) => {
  res.json({ settings: await getSettings() });
});

settingsRouter.put('/', requireAdmin, async (req, res) => {
  const data = parse(settingsSchema, req.body);
  await getSettings();
  const settings = await prisma.shopSetting.update({ where: { id: SETTINGS_ID }, data });
  res.json({ settings });
});
