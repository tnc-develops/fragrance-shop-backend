import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  /** Admin sessions are kept short because an admin token can change the whole shop. */
  ADMIN_JWT_EXPIRES_IN: z.string().default('12h'),
  UPLOAD_DIR: z.string().default('uploads'),
  /** Files that must not be public, such as bank transfer slips. Never serve this folder statically. */
  PRIVATE_UPLOAD_DIR: z.string().default('private-uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(8),
  SLIP_MAX_MB: z.coerce.number().positive().max(50).default(10),
  PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;

const corsOrigins = raw.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (raw.NODE_ENV === 'production') {
  const problems: string[] = [];
  if (raw.JWT_SECRET.length < 32 || raw.JWT_SECRET.startsWith('change-me')) {
    problems.push('JWT_SECRET must be a random string of at least 32 characters');
  }
  if (corsOrigins.includes('*')) problems.push('CORS_ORIGINS must list the shop and admin origins, not *');
  if (problems.length) {
    console.error('Refusing to start in production:');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
}

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  uploadDir: path.resolve(process.cwd(), raw.UPLOAD_DIR),
  privateUploadDir: path.resolve(process.cwd(), raw.PRIVATE_UPLOAD_DIR),
  corsOrigins,
};
