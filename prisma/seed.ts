import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, type Gender } from '@prisma/client';
import { DEFAULT_SETTINGS, SETTINGS_ID } from '../src/lib/settings';
import { ABOUT_ID, DEFAULT_ABOUT } from '../src/lib/about';
import { syncProductSummary } from '../src/services/variants';
import { DEFAULT_PAYMENT_OPTIONS } from '../src/services/payment';

const prisma = new PrismaClient();
const img = (file: string) => `/uploads/seed/${file}`;

const categories = [
  {
    slug: 'new-arrivals',
    name: 'New Arrivals',
    image: img('category-new-arrivals.jpg'),
    description: 'The latest additions to our perfume wardrobe.',
  },
  {
    slug: 'for-her',
    name: 'For Her',
    image: img('category-for-her.jpg'),
    description: 'Soft florals, luminous musks and radiant ambers.',
  },
  {
    slug: 'for-him',
    name: 'For Him',
    image: img('category-for-him.jpg'),
    description: 'Woods, spices and fresh aromatics with presence.',
  },
  {
    slug: 'luxury',
    name: 'Luxury',
    image: img('category-luxury.jpg'),
    description: 'Rare ingredients and exceptional craftsmanship.',
  },
  {
    slug: 'floral',
    name: 'Floral',
    image: img('category-floral.jpg'),
    description: 'Rose, jasmine, peony and blossoms in bloom.',
  },
  {
    slug: 'limited-edition',
    name: 'Limited Edition',
    image: img('category-limited-edition.jpg'),
    description: 'Small-batch releases, available while they last.',
  },
];

interface SeedVariant {
  sizeMl: number;
  price: number;
  salePrice?: number;
  stock: number;
  sku: string;
  shortDescription?: string;
  isDefault?: boolean;
}

interface SeedProduct {
  slug: string;
  name: string;
  brand: string;
  shortDescription: string;
  description: string;
  variants: SeedVariant[];
  concentration: string;
  gender: Gender;
  topNotes: string;
  heartNotes: string;
  baseNotes: string;
  featured: boolean;
  image: string;
  categories: string[];
}

const products: SeedProduct[] = [
  {
    slug: 'versace-eros-eau-de-parfum',
    name: 'Eros Eau de Parfum',
    brand: 'Versace',
    shortDescription: 'A magnetic blend of fresh mint, green apple and warm vanilla.',
    description:
      'Eros Eau de Parfum is a bold, sensual fragrance built on vibrant freshness and a deep, ambery woody trail. ' +
      'Crisp mint and green apple open onto tonka bean and geranium, settling into a warm base of vanilla, vetiver and cedarwood.',
    variants: [
      {
        sizeMl: 50,
        price: 24500,
        stock: 15,
        sku: 'FBS-VER-EROS-50',
        shortDescription: 'The same magnetic mint, apple and vanilla blend in an everyday 50 ml bottle.',
      },
      { sizeMl: 100, price: 34500, salePrice: 29900, stock: 24, sku: 'FBS-VER-EROS-100', isDefault: true },
      {
        sizeMl: 200,
        price: 46500,
        stock: 6,
        sku: 'FBS-VER-EROS-200',
        shortDescription: 'The collector\'s 200 ml flacon, for those who make Eros their signature.',
      },
    ],
    concentration: 'Eau de Parfum',
    gender: 'MEN',
    topNotes: 'Mint, Green Apple, Lemon',
    heartNotes: 'Tonka Bean, Geranium, Ambroxan',
    baseNotes: 'Vanilla, Vetiver, Oakmoss, Cedarwood',
    featured: true,
    image: img('perfume-2.jpg'),
    categories: ['for-him', 'luxury', 'new-arrivals'],
  },
  {
    slug: 'dive-mirissa-eau-de-parfum',
    name: 'Dive Mirissa Eau de Parfum',
    brand: 'Spa Ceylon',
    shortDescription: 'Sea salt, coconut water and frangipani from the beaches of Ceylon.',
    description:
      'Escape to the beaches of Ceylon with Dive Mirissa, an essential-oil blended eau de parfum. ' +
      'Salty sea air and bergamot meet tropical frangipani and lotus over a smooth base of driftwood and white musk.',
    variants: [
      {
        sizeMl: 30,
        price: 6500,
        stock: 30,
        sku: 'FBS-SPC-DIVE-30',
        shortDescription: 'A 30 ml travel spray of sea salt and frangipani, sized for your carry-on.',
      },
      { sizeMl: 100, price: 15500, stock: 18, sku: 'FBS-SPC-DIVE-100', isDefault: true },
    ],
    concentration: 'Eau de Parfum',
    gender: 'UNISEX',
    topNotes: 'Sea Salt, Bergamot, Coconut Water',
    heartNotes: 'Frangipani, Jasmine, Lotus',
    baseNotes: 'Driftwood, White Musk, Ambergris',
    featured: true,
    image: img('perfume-1.webp'),
    categories: ['for-him', 'new-arrivals', 'floral'],
  },
  {
    slug: 'ideal-pink-eau-de-parfum',
    name: 'Ideal Pink Eau de Parfum',
    brand: 'Ideal',
    shortDescription: 'A playful floral-fruity scent with rose, peony and raspberry.',
    description:
      'Ideal Pink is a joyful, feminine eau de parfum. Juicy raspberry and pink pepper sparkle over a bouquet of rose, ' +
      'peony and magnolia, resting on soft musk, amber and creamy sandalwood.',
    variants: [{ sizeMl: 100, price: 7900, stock: 40, sku: 'FBS-IDL-PINK-100', isDefault: true }],
    concentration: 'Eau de Parfum',
    gender: 'WOMEN',
    topNotes: 'Pink Pepper, Raspberry, Pear',
    heartNotes: 'Rose, Peony, Magnolia',
    baseNotes: 'Musk, Amber, Sandalwood',
    featured: false,
    image: img('perfume-3.webp'),
    categories: ['for-her', 'floral'],
  },
  {
    slug: 'pink-crystal-pour-femme',
    name: 'Pink Crystal Pour Femme',
    brand: 'Aromatic Club',
    shortDescription: 'Luminous lychee and lily of the valley wrapped in golden amber.',
    description:
      'Pink Crystal is a radiant, limited-edition pour femme. Lychee, mandarin and rose petals glow above lily of the valley ' +
      'and orange blossom, finishing with a warm embrace of amber, sandalwood and vanilla.',
    variants: [
      { sizeMl: 50, price: 6900, stock: 12, sku: 'FBS-ARC-PINK-50' },
      { sizeMl: 100, price: 11900, salePrice: 9900, stock: 4, sku: 'FBS-ARC-PINK-100', isDefault: true },
    ],
    concentration: 'Eau de Parfum',
    gender: 'WOMEN',
    topNotes: 'Lychee, Mandarin, Rose Petals',
    heartNotes: 'Lily of the Valley, Orange Blossom',
    baseNotes: 'Amber, Sandalwood, Vanilla',
    featured: true,
    image: img('perfume-4.webp'),
    categories: ['for-her', 'floral', 'limited-edition', 'luxury'],
  },
];

const heroSlides = [
  {
    imageDesktop: img('hero-desktop-1.png'),
    imageMobile: img('hero-mobile-1.jpg'),
    eyebrow: 'Home Fragrance Collection',
    heading: 'Scent that defines your space',
    subheading: 'Diffusers and signature oils that turn every room into a quiet luxury retreat.',
    ctaLabel: 'Explore the collection',
    ctaLink: '/shop',
  },
  {
    imageDesktop: img('hero-desktop-2.jpg'),
    imageMobile: img('hero-mobile-2.jpg'),
    eyebrow: 'Signature Perfumes',
    heading: 'The art of leaving an impression',
    subheading: 'Hand-picked eaux de parfum, crafted with rare ingredients and made to linger.',
    ctaLabel: 'Shop new arrivals',
    ctaLink: '/shop?category=new-arrivals',
  },
];

const posters = [
  {
    imageDesktop: img('poster-desktop-1.jpg'),
    imageMobile: img('poster-mobile-1.jpg'),
    title: 'Claim your free gift with orders of LKR 20,000 & above',
    link: '/shop',
  },
  {
    imageDesktop: img('poster-desktop-2.jpg'),
    imageMobile: img('poster-mobile-2.jpg'),
    title: 'Glow by Shoon - limited time 25% off',
    link: '/offers',
  },
];

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@fragrancebyshoon.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@12345';
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', isActive: true },
    create: {
      name: 'Shop Admin',
      email: adminEmail,
      role: 'ADMIN',
      passwordHash: await bcrypt.hash(adminPassword, 12),
    },
  });

  await prisma.shopSetting.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID, ...DEFAULT_SETTINGS },
  });

  await prisma.aboutPage.upsert({
    where: { id: ABOUT_ID },
    update: {},
    create: { id: ABOUT_ID, ...DEFAULT_ABOUT },
  });

  await prisma.paymentOption.createMany({ data: DEFAULT_PAYMENT_OPTIONS, skipDuplicates: true });

  for (const [index, c] of categories.entries()) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { ...c, sortOrder: index },
    });
  }

  for (const { image, categories: cats, variants, ...p } of products) {
    const primary = variants.find((v) => v.isDefault) ?? variants[0];
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        ...p,
        price: primary.price,
        stock: 0,
        categories: { connect: cats.map((slug) => ({ slug })) },
        images: { create: [{ url: image, alt: p.name, sortOrder: 0 }] },
      },
    });
    // Sizes are matched by SKU, so re-running the seed adds new sizes without touching edited ones.
    for (const [sortOrder, { isDefault, ...v }] of variants.entries()) {
      await prisma.productVariant.upsert({
        where: { sku: v.sku },
        update: {},
        create: { ...v, productId: product.id, isDefault: Boolean(isDefault), sortOrder },
      });
    }
    await syncProductSummary(product.id, prisma);
  }

  if ((await prisma.heroSlide.count()) === 0) {
    await prisma.heroSlide.createMany({ data: heroSlides.map((s, sortOrder) => ({ ...s, sortOrder })) });
  }
  if ((await prisma.poster.count()) === 0) {
    await prisma.poster.createMany({ data: posters.map((p, sortOrder) => ({ ...p, sortOrder })) });
  }

  console.log(`Seed complete. Admin login: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
