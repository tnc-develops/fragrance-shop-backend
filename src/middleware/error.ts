import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { HttpError } from '../lib/http';
import { env } from '../config/env';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: 'The upload could not be read' });
    return;
  }

  // body-parser (malformed JSON, body too large) and static file (missing upload) errors
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    const message = err.status === 404 ? 'Not found' : err.status === 413 ? 'Request is too large' : 'Invalid request';
    res.status(err.status).json({ error: message });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'A record with these details already exists' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({ error: 'This record is referenced by other data and cannot be changed' });
      return;
    }
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: env.isProd ? 'Something went wrong. Please try again.' : String(err?.message ?? err) });
};
