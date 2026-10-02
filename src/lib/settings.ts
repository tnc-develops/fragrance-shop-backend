import { Prisma, type ShopSetting } from '@prisma/client';
import { prisma } from './prisma';

export const SETTINGS_ID = 1;

export const DEFAULT_COLORS = {
  ivory: '#F4EFE7',
  charcoal: '#171717',
  gold: '#C9A66B',
  taupe: '#A99B89',
  text: '#24211E',
  espresso: '#30251F',
};

export type ThemeColors = typeof DEFAULT_COLORS;

export const DEFAULT_SETTINGS = {
  shopName: 'Fragrance by Shoon',
  tagline: 'Signature scents, crafted to linger',
  logoLightUrl: '/uploads/seed/logo-light.png',
  logoDarkUrl: '/uploads/seed/logo-dark.png',
  announcement: 'Free island-wide delivery on orders over LKR 20,000',
  currency: 'LKR',
  currencySymbol: 'LKR',
  shippingFee: new Prisma.Decimal(450),
  freeShippingThreshold: new Prisma.Decimal(20000),
  heroIntervalMs: 5000,
  contactEmail: 'hello@fragrancebyshoon.com',
  contactPhone: '+94 77 000 0000',
  whatsappNumber: '+94 77 000 0000',
  openingHours: 'Monday to Saturday, 9.00 am to 7.00 pm',
  address: 'Colombo, Sri Lanka',
  instagramUrl: 'https://instagram.com/',
  facebookUrl: 'https://facebook.com/',
  metaDescription:
    'Buy original perfumes online in Sri Lanka. Luxury eau de parfum for men and women in LKR, island-wide delivery, cash on delivery or bank transfer.',
  seoTitle: 'Original Perfumes in Sri Lanka | Fragrance by Shoon',
  seoKeywords: [
    'perfume Sri Lanka',
    'perfumes in Sri Lanka',
    'buy perfume online Sri Lanka',
    'original perfumes Sri Lanka',
    'perfume shop Colombo',
    'luxury perfumes Sri Lanka',
    'fragrance Sri Lanka',
    'perfume price in Sri Lanka',
    'eau de parfum Sri Lanka',
    "men's perfume Sri Lanka",
    "women's perfume Sri Lanka",
    'unisex fragrance',
    'designer perfumes',
    'perfume gift Sri Lanka',
    'perfume cash on delivery Sri Lanka',
  ].join(', '),
  googleVerification: null,
  seoIntroHeading: 'Original perfumes, delivered across Sri Lanka',
  seoIntroText: [
    'Fragrance by Shoon is an online perfume shop in Sri Lanka for original designer fragrances. Browse eau de parfum and eau de toilette for men and women, compare sizes and prices in LKR, and find your signature scent or the perfect perfume gift.',
    'Every order is packed with care and delivered island-wide, from Colombo, Kandy and Galle to Jaffna. Pay by cash on delivery or bank transfer, and message us on WhatsApp for advice on notes, longevity and sizes.',
  ].join('\n\n'),
  colors: DEFAULT_COLORS,
} satisfies Omit<Prisma.ShopSettingCreateInput, 'id'>;

export async function getSettings(): Promise<ShopSetting> {
  const existing = await prisma.shopSetting.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.shopSetting.create({ data: { id: SETTINGS_ID, ...DEFAULT_SETTINGS } });
}

export function shippingFor(subtotal: Prisma.Decimal, settings: ShopSetting): Prisma.Decimal {
  if (subtotal.isZero()) return new Prisma.Decimal(0);
  if (settings.freeShippingThreshold && subtotal.gte(settings.freeShippingThreshold)) {
    return new Prisma.Decimal(0);
  }
  return settings.shippingFee;
}
