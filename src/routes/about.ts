import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { imagePathSchema, linkSchema, parse } from '../lib/http';
import { ABOUT_ID, getAbout } from '../lib/about';
import { requireAdmin } from '../middleware/auth';

export const aboutRouter = Router();

const optional = (max: number) => z.string().trim().max(max).nullable().optional();

const aboutSchema = z.object({
  eyebrow: optional(80),
  heading: z.string().trim().min(1, 'Add a heading').max(160).optional(),
  intro: optional(2000),
  heroImage: imagePathSchema().nullable().optional(),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Add a title').max(160),
        body: z.string().trim().min(1, 'Add some text').max(5000),
        image: imagePathSchema().nullable(),
      }),
    )
    .max(10)
    .optional(),
  values: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Add a title').max(80),
        text: z.string().trim().max(300),
      }),
    )
    .max(8)
    .optional(),
  ctaHeading: optional(160),
  ctaLabel: optional(60),
  ctaLink: linkSchema().nullable().optional(),
});

aboutRouter.get('/', async (_req, res) => {
  res.json({ about: await getAbout() });
});

aboutRouter.put('/', requireAdmin, async (req, res) => {
  const data = parse(aboutSchema, req.body);
  await getAbout();
  const about = await prisma.aboutPage.update({ where: { id: ABOUT_ID }, data });
  res.json({ about });
});
