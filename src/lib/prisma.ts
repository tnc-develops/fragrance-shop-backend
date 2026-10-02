import { Prisma, PrismaClient } from '@prisma/client';

// Money columns are DECIMAL; send them to clients as JSON numbers instead of strings.
(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function (this: Prisma.Decimal) {
  return this.toNumber();
};

export const prisma = new PrismaClient();
