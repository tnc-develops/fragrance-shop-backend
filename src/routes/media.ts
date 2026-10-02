import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { badRequest, notFound, parse } from '../lib/http';
import { requireAdmin } from '../middleware/auth';
import { LIBRARY_DIR, toPublicPath, uploadImages } from '../middleware/upload';

export const mediaRouter = Router();

mediaRouter.use(requireAdmin);

const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif)$/i;

async function listDir(sub: string) {
  const dir = path.join(env.uploadDir, sub);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const files = await Promise.all(
    names
      .filter((n) => IMAGE_EXT.test(n))
      .map(async (name) => {
        const abs = path.join(dir, name);
        const stat = await fs.stat(abs);
        return { url: toPublicPath(abs), name, size: stat.size, folder: sub, modifiedAt: stat.mtime };
      }),
  );
  return files;
}

mediaRouter.get('/', async (_req, res) => {
  const [library, seed] = await Promise.all([listDir(LIBRARY_DIR), listDir('seed')]);
  const items = [...library, ...seed].sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  res.json({ items });
});

mediaRouter.post('/', uploadImages('files', 10), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw badRequest('No files uploaded (use the "files" field)');
  res.status(201).json({
    items: files.map((f) => ({ url: toPublicPath(f.path), name: f.filename, size: f.size, folder: LIBRARY_DIR, modifiedAt: new Date() })),
  });
});

mediaRouter.delete('/', async (req, res) => {
  const { url } = parse(z.object({ url: z.string().min(1) }), req.body);
  const prefix = `/uploads/${LIBRARY_DIR}/`;
  if (!url.startsWith(prefix)) throw badRequest('Only uploaded library images can be deleted');

  const libraryDir = path.join(env.uploadDir, LIBRARY_DIR);
  const abs = path.resolve(libraryDir, url.slice(prefix.length));
  if (path.dirname(abs) !== libraryDir) throw badRequest('Invalid path');

  await fs.unlink(abs).catch(() => {
    throw notFound('File not found');
  });
  res.status(204).end();
});
