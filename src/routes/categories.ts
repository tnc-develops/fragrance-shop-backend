import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { idParam, imagePathSchema, notFound, parse } from '../lib/http';
import { uniqueSlug } from '../lib/slug';
import { isAdmin, optionalAuth, requireAdmin } from '../middleware/auth';

export const categoriesRouter = Router();

const categoryFields = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(160).optional(),
  description: z.string().max(5000).nullable().optional(),
  image: imagePathSchema().nullable().optional(),
  sortOrder: z.coerce.number().int(),
  isActive: z.boolean(),
});

const createSchema = categoryFields.extend({
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

categoriesRouter.get('/', optionalAuth, async (req, res) => {
  const includeInactive = isAdmin(req) && req.query.all === '1';
  const categories = await prisma.category.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { products: includeInactive ? true : { where: { isActive: true } } } },
    },
  });
  res.json({
    items: categories.map(({ _count, ...c }) => ({ ...c, productCount: _count.products })),
  });
});

categoriesRouter.get('/id/:id', requireAdmin, async (req, res) => {
  const category = await prisma.category.findUnique({ where: { id: idParam(req) } });
  if (!category) throw notFound('Category not found');
  res.json({ category });
});

categoriesRouter.get('/:slug', optionalAuth, async (req, res) => {
  const category = await prisma.category.findUnique({ where: { slug: String(req.params.slug) } });
  if (!category || (!category.isActive && !isAdmin(req))) throw notFound('Category not found');
  res.json({ category });
});

categoriesRouter.post('/', requireAdmin, async (req, res) => {
  const data = parse(createSchema, req.body);
  const slug = await uniqueSlug(data.slug || data.name, async (s) =>
    Boolean(await prisma.category.findUnique({ where: { slug: s } })),
  );
  const category = await prisma.category.create({ data: { ...data, slug } });
  res.status(201).json({ category });
});

categoriesRouter.patch('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const data = parse(categoryFields.partial(), req.body);
  if (data.slug) {
    data.slug = await uniqueSlug(data.slug, async (s) => {
      const hit = await prisma.category.findUnique({ where: { slug: s } });
      return Boolean(hit && hit.id !== id);
    });
  } else {
    delete data.slug;
  }
  const category = await prisma.category.update({ where: { id }, data });
  res.json({ category });
});

categoriesRouter.delete('/:id', requireAdmin, async (req, res) => {
  await prisma.category.delete({ where: { id: idParam(req) } });
  res.status(204).end();
});
