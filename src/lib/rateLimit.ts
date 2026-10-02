import rateLimit from 'express-rate-limit';

/**
 * Per-IP limiter for endpoints that browsers call directly. Don't put these on routes the storefront's
 * server renders from (catalog, settings): all of those requests share the Next server's IP.
 */
export function limiter(limit: number, minutes: number, message = 'Too many requests. Please wait a few minutes and try again.') {
  return rateLimit({
    windowMs: minutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: message },
  });
}
