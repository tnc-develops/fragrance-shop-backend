import type { AboutPage, Prisma } from '@prisma/client';
import { prisma } from './prisma';

export const ABOUT_ID = 1;

export interface AboutSection {
  title: string;
  body: string;
  image: string | null;
}

export interface AboutValue {
  title: string;
  text: string;
}

export const DEFAULT_ABOUT = {
  eyebrow: 'Our story',
  heading: 'Scents that stay with you',
  intro:
    'Fragrance by Shoon is a Colombo-based perfume house bringing authentic designer fragrances, ' +
    'Ceylon-inspired blends and hand-picked attars to fragrance lovers across Sri Lanka.',
  heroImage: '/uploads/seed/hero-desktop-2.jpg',
  sections: [
    {
      title: 'Where it began',
      body:
        'What started as a small collection shared between friends grew into a boutique for people who believe a scent ' +
        'is the most personal thing you wear.\n\nEvery fragrance on our shelves is one we have worn, tested in our tropical ' +
        'climate and fallen in love with.',
      image: '/uploads/seed/category-luxury.jpg',
    },
    {
      title: 'Curated, never compromised',
      body:
        'We work only with trusted distributors, so every bottle is 100% authentic and stored the way perfume deserves.\n\n' +
        'From everyday fresh scents to rare limited editions, our team is happy to help you find the one that feels like you.',
      image: '/uploads/seed/perfume-2.jpg',
    },
  ] satisfies AboutSection[],
  values: [
    { title: '100% authentic', text: 'Sourced from trusted distributors, sealed and stored with care.' },
    { title: 'Island-wide delivery', text: 'Carefully packed and delivered to your door anywhere in Sri Lanka.' },
    { title: 'Cash on delivery', text: 'Pay in cash when your order arrives. No card needed.' },
    { title: 'Personal advice', text: 'Not sure which scent to choose? Message us and we will guide you.' },
  ] satisfies AboutValue[],
  ctaHeading: 'Find your signature scent',
  ctaLabel: 'Shop the collection',
  ctaLink: '/shop',
} satisfies Omit<Prisma.AboutPageCreateInput, 'id'>;

export async function getAbout(): Promise<AboutPage> {
  const existing = await prisma.aboutPage.findUnique({ where: { id: ABOUT_ID } });
  if (existing) return existing;
  return prisma.aboutPage.create({ data: { id: ABOUT_ID, ...DEFAULT_ABOUT } });
}
