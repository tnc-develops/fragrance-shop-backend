import { Prisma, type ShopSetting } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { shippingFor } from '../lib/settings';
import { variantLabel } from './variants';

export interface LineInput {
  variantId: number;
  quantity: number;
}

const pricingInclude = {
  images: { orderBy: { sortOrder: 'asc' }, take: 1 },
  product: {
    include: { images: { where: { variantId: null }, orderBy: { sortOrder: 'asc' }, take: 1 } },
  },
} satisfies Prisma.ProductVariantInclude;

type VariantForPricing = Prisma.ProductVariantGetPayload<{ include: typeof pricingInclude }>;

export function effectivePrice(p: { price: Prisma.Decimal; salePrice: Prisma.Decimal | null }): Prisma.Decimal {
  return p.salePrice && p.salePrice.lt(p.price) ? p.salePrice : p.price;
}

export interface QuoteLine {
  productId: number;
  variantId: number;
  name: string;
  variantLabel: string | null;
  slug: string;
  image: string | null;
  price: Prisma.Decimal;
  compareAtPrice: Prisma.Decimal | null;
  quantity: number;
  stock: number;
  lineTotal: Prisma.Decimal;
  issue: string | null;
}

export interface Quote {
  lines: QuoteLine[];
  missingVariantIds: number[];
  subtotal: Prisma.Decimal;
  shippingFee: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string;
  currencySymbol: string;
  freeShippingThreshold: Prisma.Decimal | null;
  hasIssues: boolean;
}

/** Collapses duplicate variant ids and drops non-positive quantities. */
export function normalizeLines(items: LineInput[]): LineInput[] {
  const map = new Map<number, number>();
  for (const { variantId, quantity } of items) {
    if (quantity > 0) map.set(variantId, (map.get(variantId) ?? 0) + quantity);
  }
  return [...map].map(([variantId, quantity]) => ({ variantId, quantity }));
}

export async function buildQuote(
  items: LineInput[],
  settings: ShopSetting,
  db: Prisma.TransactionClient = prisma,
): Promise<Quote> {
  const lines = normalizeLines(items);
  const variants: VariantForPricing[] = lines.length
    ? await db.productVariant.findMany({
        where: { id: { in: lines.map((l) => l.variantId) } },
        include: pricingInclude,
      })
    : [];
  const byId = new Map(variants.map((v) => [v.id, v]));

  const quoteLines: QuoteLine[] = [];
  const missingVariantIds: number[] = [];
  let subtotal = new Prisma.Decimal(0);

  for (const line of lines) {
    const variant = byId.get(line.variantId);
    if (!variant) {
      missingVariantIds.push(line.variantId);
      continue;
    }
    const { product } = variant;

    const price = effectivePrice(variant);
    let issue: string | null = null;
    let billable = line.quantity;

    if (!product.isActive || !variant.isActive) {
      issue = 'No longer available';
      billable = 0;
    } else if (variant.stock <= 0) {
      issue = 'Out of stock';
      billable = 0;
    } else if (line.quantity > variant.stock) {
      issue = `Only ${variant.stock} left in stock`;
      billable = variant.stock;
    }

    const lineTotal = price.mul(billable);
    subtotal = subtotal.add(lineTotal);

    quoteLines.push({
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      variantLabel: variantLabel(variant),
      slug: product.slug,
      image: variant.images[0]?.url ?? product.images[0]?.url ?? null,
      price,
      compareAtPrice: price.lt(variant.price) ? variant.price : null,
      quantity: line.quantity,
      stock: variant.stock,
      lineTotal,
      issue,
    });
  }

  const shippingFee = shippingFor(subtotal, settings);

  return {
    lines: quoteLines,
    missingVariantIds,
    subtotal,
    shippingFee,
    total: subtotal.add(shippingFee),
    currency: settings.currency,
    currencySymbol: settings.currencySymbol,
    freeShippingThreshold: settings.freeShippingThreshold,
    hasIssues: missingVariantIds.length > 0 || quoteLines.some((l) => l.issue),
  };
}
