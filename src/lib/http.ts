import type { Request } from 'express';
import { z, type ZodType } from 'zod';

const HTTP_URL = /^https?:\/\/[^\s]+$/i;

/** A page link shown to shoppers: a site path like `/shop?category=x`, or an http(s) URL. Blocks `javascript:` and `//host`. */
export const linkSchema = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => v === '' || (v.startsWith('/') && !v.startsWith('//')) || HTTP_URL.test(v), {
      message: 'Use a page path such as /shop, or a full link starting with https://',
    });

/** An external profile link such as Instagram: http(s) only. */
export const webUrlSchema = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => v === '' || HTTP_URL.test(v), { message: 'Use a full link starting with https://' });

/** An image chosen from the media library (`/uploads/...`) or an http(s) image URL. */
export const imagePathSchema = (max = 500) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => (v.startsWith('/uploads/') && !v.includes('..')) || HTTP_URL.test(v), {
      message: 'Choose an image from the media library',
    });

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
export const forbidden = (message = 'You do not have access to this resource') => new HttpError(403, message);
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(
      'Validation failed',
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export function idParam(req: Request, name = 'id'): number {
  const value = Number(req.params[name]);
  if (!Number.isInteger(value) || value <= 0) throw badRequest(`Invalid ${name}`);
  return value;
}

export function pagination(query: Request['query'], defaults = { limit: 12, maxLimit: 100 }) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(defaults.maxLimit, Math.max(1, Number(query.limit) || defaults.limit));
  return { page, limit, skip: (page - 1) * limit };
}
