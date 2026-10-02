import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** "Travel spray", "50 ml", or null when the variant has neither a label nor a size. */
export function variantLabel(v: { label: string | null; sizeMl: number | null }): string | null {
  return v.label?.trim() || (v.sizeMl ? `${v.sizeMl} ml` : null);
}

const payable = (v: { price: Prisma.Decimal; salePrice: Prisma.Decimal | null }) =>
  v.salePrice && v.salePrice.lt(v.price) ? v.salePrice : v.price;

/**
 * Refreshes the product's summary columns from its variants: the cheapest active variant's
 * price and sale price, the total active stock and the default variant's size.
 */
export async function syncProductSummary(productId: number, db: Prisma.TransactionClient = prisma) {
  const variants = await db.productVariant.findMany({
    where: { productId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  if (!variants.length) return;

  const active = variants.filter((v) => v.isActive);
  const pool = active.length ? active : variants;
  const cheapest = pool.reduce((best, v) => (payable(v).lt(payable(best)) ? v : best));
  const defaultVariant = variants.find((v) => v.isDefault) ?? pool[0];

  await db.product.update({
    where: { id: productId },
    data: {
      price: cheapest.price,
      salePrice: cheapest.salePrice && cheapest.salePrice.lt(cheapest.price) ? cheapest.salePrice : null,
      stock: active.reduce((sum, v) => sum + v.stock, 0),
      sizeMl: defaultVariant.sizeMl,
    },
  });
}

export async function syncProductSummaries(productIds: Iterable<number>, db: Prisma.TransactionClient = prisma) {
  for (const id of new Set(productIds)) await syncProductSummary(id, db);
}
