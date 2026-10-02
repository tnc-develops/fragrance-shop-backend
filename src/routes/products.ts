import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { idParam, imagePathSchema, notFound, pagination, parse } from '../lib/http';
import { uniqueSlug } from '../lib/slug';
import { isAdmin, optionalAuth, requireAdmin } from '../middleware/auth';
import { syncProductSummary } from '../services/variants';

export const productsRouter = Router();

const variantOrder = [{ sortOrder: 'asc' }, { id: 'asc' }] satisfies Prisma.ProductVariantOrderByWithRelationInput[];
const categorySelect = { select: { id: true, name: true, slug: true } } as const;

/** Shared images have no variant; each variant carries its own images. Inactive sizes are admin-only. */
function productInclude({ detail, allVariants }: { detail: boolean; allVariants: boolean }) {
  return {
    images: { where: { variantId: null }, orderBy: { sortOrder: 'asc' }, ...(detail ? {} : { take: 2 }) },
    variants: {
      where: allVariants ? undefined : { isActive: true },
      orderBy: variantOrder,
      include: { images: { orderBy: { sortOrder: 'asc' }, ...(detail ? {} : { take: 1 }) } },
    },
    categories: categorySelect,
  } satisfies Prisma.ProductInclude;
}

const SORTS: Record<string, Prisma.ProductOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }],
  price_asc: [{ price: 'asc' }],
  price_desc: [{ price: 'desc' }],
  rating: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }],
  name: [{ name: 'asc' }],
  featured: [{ featured: 'desc' }, { createdAt: 'desc' }],
};

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const money = z.coerce.number().nonnegative().max(99_999_999);

const imagesSchema = z.array(z.object({ url: imagePathSchema(), alt: optionalText(200) })).max(20);

const variantSchema = z
  .object({
    id: z.number().int().positive().optional(),
    sizeMl: z.coerce.number().int().positive().max(10_000).nullable().optional(),
    label: optionalText(60),
    price: money,
    salePrice: money.nullable().optional(),
    stock: z.coerce.number().int().min(0).default(0),
    sku: optionalText(64),
    shortDescription: optionalText(300),
    description: optionalText(20000),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
    images: imagesSchema.default([]),
  })
  .refine((v) => v.salePrice == null || v.salePrice < v.price, {
    path: ['salePrice'],
    message: 'Sale price must be lower than the price',
  })
  .refine((v) => v.sizeMl != null || Boolean(v.label?.trim()), {
    path: ['sizeMl'],
    message: 'Enter a size or a label',
  });

// No defaults here: zod applies defaults inside .partial(), which would clobber fields on PATCH.
const productFields = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().max(191).optional(),
  brand: optionalText(120),
  shortDescription: optionalText(300),
  description: optionalText(20000),
  concentration: optionalText(60),
  gender: z.enum(['MEN', 'WOMEN', 'UNISEX']),
  topNotes: optionalText(300),
  heartNotes: optionalText(300),
  baseNotes: optionalText(300),
  featured: z.boolean(),
  isActive: z.boolean(),
  seoTitle: optionalText(160),
  seoDescription: optionalText(320),
  categoryIds: z.array(z.number().int().positive()),
  images: imagesSchema,
  variants: z.array(variantSchema).min(1, 'Add at least one size').max(20),
});

const createSchema = productFields.extend({
  gender: productFields.shape.gender.default('UNISEX'),
  featured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  categoryIds: productFields.shape.categoryIds.default([]),
  images: imagesSchema.default([]),
});

const updateSchema = productFields.partial();

type ProductInput = z.infer<typeof productFields>;
type VariantInput = ProductInput['variants'][number];

function emptyToNull<T extends string | null | undefined>(v: T): string | null {
  return v === '' || v === undefined ? null : v;
}

function scalarData<T extends Partial<ProductInput>>(data: T) {
  const { categoryIds: _c, images: _i, slug: _s, variants: _v, ...rest } = data;
  return rest;
}

function imageRows(images: ProductInput['images']) {
  return images.map((img, index) => ({ url: img.url, alt: img.alt ?? null, sortOrder: index }));
}

/** The first size marked default wins; otherwise the first active size, otherwise the first. */
function defaultIndex(variants: VariantInput[]) {
  const marked = variants.findIndex((v) => v.isDefault);
  if (marked >= 0) return marked;
  const active = variants.findIndex((v) => v.isActive);
  return active >= 0 ? active : 0;
}

/** Makes the product's variants match `variants`: updates by id, creates new ones, deletes the rest. */
async function saveVariants(tx: Prisma.TransactionClient, productId: number, variants: VariantInput[]) {
  const existing = await tx.productVariant.findMany({ where: { productId }, select: { id: true } });
  const existingIds = new Set(existing.map((v) => v.id));
  const keep = variants.map((v) => v.id).filter((id): id is number => id !== undefined && existingIds.has(id));

  await tx.productVariant.deleteMany({ where: { productId, id: { notIn: keep } } });

  const primary = defaultIndex(variants);
  for (const [index, v] of variants.entries()) {
    const data = {
      sizeMl: v.sizeMl ?? null,
      label: emptyToNull(v.label),
      price: v.price,
      salePrice: v.salePrice ?? null,
      stock: v.stock,
      sku: emptyToNull(v.sku),
      shortDescription: emptyToNull(v.shortDescription),
      description: emptyToNull(v.description),
      isDefault: index === primary,
      isActive: v.isActive,
      sortOrder: index,
    };
    const images = imageRows(v.images).map((row) => ({ ...row, productId }));
    if (v.id !== undefined && existingIds.has(v.id)) {
      await tx.productVariant.update({
        where: { id: v.id },
        data: { ...data, images: { deleteMany: {}, create: images } },
      });
    } else {
      await tx.productVariant.create({ data: { ...data, productId, images: { create: images } } });
    }
  }

  await syncProductSummary(productId, tx);
}

const slugTaken = (excludeId?: number) => async (slug: string) => {
  const hit = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
  return Boolean(hit && hit.id !== excludeId);
};

const adminDetail = (id: number) =>
  prisma.product.findUnique({ where: { id }, include: productInclude({ detail: true, allVariants: true }) });

productsRouter.get('/', optionalAuth, async (req, res) => {
  const q = req.query;
  const { page, limit, skip } = pagination(q);
  const and: Prisma.ProductWhereInput[] = [];
  const adminView = isAdmin(req) && q.all === '1';

  if (!adminView) and.push({ isActive: true, variants: { some: { isActive: true } } });

  if (typeof q.search === 'string' && q.search.trim()) {
    const term = q.search.trim();
    and.push({
      OR: [
        { name: { contains: term } },
        { brand: { contains: term } },
        { shortDescription: { contains: term } },
        { concentration: { contains: term } },
        { topNotes: { contains: term } },
        { heartNotes: { contains: term } },
        { baseNotes: { contains: term } },
        { categories: { some: { name: { contains: term } } } },
        { variants: { some: { sku: { contains: term } } } },
      ],
    });
  }
  if (typeof q.category === 'string' && q.category) {
    and.push({ categories: { some: { slug: q.category } } });
  }
  if (typeof q.gender === 'string' && ['MEN', 'WOMEN', 'UNISEX'].includes(q.gender)) {
    and.push({ gender: q.gender as 'MEN' | 'WOMEN' | 'UNISEX' });
  }
  if (q.featured === '1') and.push({ featured: true });
  if (q.inStock === '1') and.push({ variants: { some: { isActive: true, stock: { gt: 0 } } } });
  if (q.onSale === '1') and.push({ variants: { some: { isActive: true, salePrice: { not: null } } } });

  const min = Number(q.minPrice);
  const max = Number(q.maxPrice);
  const range: Prisma.DecimalFilter = {};
  if (Number.isFinite(min) && q.minPrice !== undefined && q.minPrice !== '') range.gte = min;
  if (Number.isFinite(max) && q.maxPrice !== undefined && q.maxPrice !== '') range.lte = max;
  if (Object.keys(range).length) {
    // Matches when any size's payable price falls in the range.
    and.push({
      variants: { some: { isActive: true, OR: [{ salePrice: null, price: range }, { salePrice: range }] } },
    });
  }

  const where: Prisma.ProductWhereInput = { AND: and };
  const orderBy = SORTS[String(q.sort)] ?? SORTS.featured;

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: productInclude({ detail: false, allVariants: adminView }),
    }),
    prisma.product.count({ where }),
  ]);

  res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

productsRouter.get('/id/:id', requireAdmin, async (req, res) => {
  const product = await adminDetail(idParam(req));
  if (!product) throw notFound('Product not found');
  res.json({ product });
});

productsRouter.get('/:slug', optionalAuth, async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { slug: String(req.params.slug) },
    include: productInclude({ detail: true, allVariants: false }),
  });
  if (!product || ((!product.isActive || !product.variants.length) && !isAdmin(req))) {
    throw notFound('Product not found');
  }

  const related = await prisma.product.findMany({
    where: {
      isActive: true,
      variants: { some: { isActive: true } },
      id: { not: product.id },
      categories: product.categories.length
        ? { some: { id: { in: product.categories.map((c) => c.id) } } }
        : undefined,
    },
    orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    take: 4,
    include: productInclude({ detail: false, allVariants: false }),
  });

  res.json({ product, related });
});

productsRouter.post('/', requireAdmin, async (req, res) => {
  const data = parse(createSchema, req.body);
  const slug = await uniqueSlug(data.slug || data.name, slugTaken());
  const id = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        ...scalarData(data),
        slug,
        // Placeholder summary; saveVariants recomputes it.
        price: data.variants[0].price,
        stock: 0,
        categories: { connect: data.categoryIds.map((cid) => ({ id: cid })) },
        images: { create: imageRows(data.images) },
      },
      select: { id: true },
    });
    await saveVariants(tx, created.id, data.variants);
    return created.id;
  });
  res.status(201).json({ product: await adminDetail(id) });
});

productsRouter.patch('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req);
  const data = parse(updateSchema, req.body);

  const update: Prisma.ProductUpdateInput = scalarData(data);
  if (data.slug) update.slug = await uniqueSlug(data.slug, slugTaken(id));
  if (data.categoryIds) update.categories = { set: data.categoryIds.map((cid) => ({ id: cid })) };
  if (data.images) update.images = { deleteMany: { variantId: null }, create: imageRows(data.images) };

  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: update, select: { id: true } });
    if (data.variants) await saveVariants(tx, id, data.variants);
  });
  res.json({ product: await adminDetail(id) });
});

productsRouter.delete('/:id', requireAdmin, async (req, res) => {
  await prisma.product.delete({ where: { id: idParam(req) } });
  res.status(204).end();
});
