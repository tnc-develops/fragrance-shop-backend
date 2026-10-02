import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';

export function createApp() {
  const app = express();

  fs.mkdirSync(env.uploadDir, { recursive: true });

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Images are embedded by the storefront and admin on other origins.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin(origin, cb) {
        cb(null, !origin || env.corsOrigins.includes(origin));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', (req, res, next) => {
    // Personal data must never sit in shared caches or the browser's disk cache. Public catalog reads stay cacheable.
    if (req.headers.authorization || /^\/(auth|orders|admin|media|reviews\/mine)/.test(req.path)) {
      res.setHeader('Cache-Control', 'private, no-store');
    }
    next();
  });
  app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.use(
    '/uploads',
    express.static(env.uploadDir, {
      maxAge: env.isProd ? '30d' : 0,
      fallthrough: false,
      index: false,
      dotfiles: 'deny',
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
