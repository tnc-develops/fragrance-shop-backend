import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { idParam, imagePathSchema, linkSchema, parse } from '../lib/http';
import { requireAdmin } from '../middleware/auth';

const image = imagePathSchema();
const optional = (max: number) => z.string().trim().max(max).nullable().optional();
const reorderSchema = z.object({ ids: z.array(z.number().int().positive()).min(1) });

// ----- Hero slides -----

export const heroRouter = Router();

const heroFields = z.object({
  imageDesktop: image,
  imageMobile: image.nullable().optional(),
  eyebrow: optional(120),
  heading: optional(200),
  subheading: optional(400),
  ctaLabel: optional(60),
  ctaLink: linkSchema().nullable().optional(),
  sortOrder: z.number().int(),
  active: z.boolean(),
});

const heroOrder = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];

heroRouter.get('/', async (_req, res) => {
  res.json({ items: await prisma.heroSlide.findMany({ where: { active: true }, orderBy: heroOrder }) });
});

heroRouter.get('/all', requireAdmin, async (_req, res) => {
  res.json({ items: await prisma.heroSlide.findMany({ orderBy: heroOrder }) });
});

heroRouter.post('/', requireAdmin, async (req, res) => {
  const data = parse(heroFields.partial({ sortOrder: true, active: true }), req.body);
  const last = await prisma.heroSlide.aggregate({ _max: { sortOrder: true } });
  const slide = await prisma.heroSlide.create({
    data: { ...data, sortOrder: data.sortOrder ?? (last._max.sortOrder ?? -1) + 1, active: data.active ?? true },
  });
  res.status(201).json({ slide });
});

heroRouter.put('/reorder', requireAdmin, async (req, res) => {
  const { ids } = parse(reorderSchema, req.body);
  await prisma.$transaction(ids.map((id, index) => prisma.heroSlide.update({ where: { id }, data: { sortOrder: index } })));
  res.json({ items: await prisma.heroSlide.findMany({ orderBy: heroOrder }) });
});

heroRouter.patch('/:id', requireAdmin, async (req, res) => {
  const slide = await prisma.heroSlide.update({
    where: { id: idParam(req) },
    data: parse(heroFields.partial(), req.body),
  });
  res.json({ slide });
});

heroRouter.delete('/:id', requireAdmin, async (req, res) => {
  await prisma.heroSlide.delete({ where: { id: idParam(req) } });
  res.status(204).end();
});

// ----- Posters -----

export const postersRouter = Router();

const posterFields = z.object({
  imageDesktop: image,
  imageMobile: image.nullable().optional(),
  title: optional(200),
  link: linkSchema().nullable().optional(),
  sortOrder: z.number().int(),
  active: z.boolean(),
});

postersRouter.get('/', async (_req, res) => {
  res.json({ items: await prisma.poster.findMany({ where: { active: true }, orderBy: heroOrder }) });
});

postersRouter.get('/all', requireAdmin, async (_req, res) => {
  res.json({ items: await prisma.poster.findMany({ orderBy: heroOrder }) });
});

postersRouter.post('/', requireAdmin, async (req, res) => {
  const data = parse(posterFields.partial({ sortOrder: true, active: true }), req.body);
  const last = await prisma.poster.aggregate({ _max: { sortOrder: true } });
  const poster = await prisma.poster.create({
    data: { ...data, sortOrder: data.sortOrder ?? (last._max.sortOrder ?? -1) + 1, active: data.active ?? true },
  });
  res.status(201).json({ poster });
});

postersRouter.put('/reorder', requireAdmin, async (req, res) => {
  const { ids } = parse(reorderSchema, req.body);
  await prisma.$transaction(ids.map((id, index) => prisma.poster.update({ where: { id }, data: { sortOrder: index } })));
  res.json({ items: await prisma.poster.findMany({ orderBy: heroOrder }) });
});

postersRouter.patch('/:id', requireAdmin, async (req, res) => {
  const poster = await prisma.poster.update({
    where: { id: idParam(req) },
    data: parse(posterFields.partial(), req.body),
  });
  res.json({ poster });
});

postersRouter.delete('/:id', requireAdmin, async (req, res) => {
  await prisma.poster.delete({ where: { id: idParam(req) } });
  res.status(204).end();
});
