import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { badRequest, HttpError } from '../lib/http';

export const LIBRARY_DIR = 'library';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const dir = path.join(env.uploadDir, LIBRARY_DIR);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const base = path
      .parse(file.originalname)
      .name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `${base || 'image'}-${unique}${ALLOWED_TYPES[file.mimetype]}`);
  },
});

const imageMulter = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 10 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_TYPES[file.mimetype]) {
      cb(badRequest('Only JPEG, PNG, WEBP, AVIF and GIF images are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const SLIPS_DIR = 'slips';

const SLIP_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

/** Bank transfer slips: one file per request, saved in the private upload dir as `<order number>-<random>.<ext>`. */
const slipMulter = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      const dir = path.join(env.privateUploadDir, SLIPS_DIR);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      const order = String(req.params.orderNumber ?? 'order').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
      cb(null, `${order}-${crypto.randomBytes(8).toString('hex')}${SLIP_TYPES[file.mimetype]}`);
    },
  }),
  limits: { fileSize: env.SLIP_MAX_MB * 1024 * 1024, files: 1, fields: 5 },
  fileFilter(_req, file, cb) {
    if (!SLIP_TYPES[file.mimetype]) {
      cb(badRequest('Upload the slip as a JPG, PNG or WEBP photo, or a PDF'));
      return;
    }
    cb(null, true);
  },
});

// ----- Content checks -----

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf: Buffer, start: number, end: number) => buf.subarray(start, end).toString('latin1');

/** Checks the file's first bytes, so a script renamed to `.png` or sent with a fake content type is rejected. */
function matchesSignature(buf: Buffer, mimetype: string): boolean {
  switch (mimetype) {
    case 'image/jpeg':
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(ascii(buf, 0, 6));
    case 'image/webp':
      return ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP';
    case 'image/avif':
      return ascii(buf, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(buf, 8, 12));
    case 'application/pdf':
      return ascii(buf, 0, 5) === '%PDF-';
    default:
      return false;
  }
}

async function verifyFiles(files: Express.Multer.File[]): Promise<void> {
  const bad: Express.Multer.File[] = [];
  for (const file of files) {
    const handle = await fs.promises.open(file.path, 'r');
    try {
      const head = Buffer.alloc(16);
      await handle.read(head, 0, 16, 0);
      if (!matchesSignature(head, file.mimetype)) bad.push(file);
    } finally {
      await handle.close();
    }
  }
  if (bad.length) {
    await Promise.all(files.map((f) => fs.promises.unlink(f.path).catch(() => {})));
    throw badRequest(`${bad[0].originalname} is not a valid ${bad[0].mimetype === 'application/pdf' ? 'PDF' : 'image'} file`);
  }
}

/** Runs a multer middleware, turns its errors into friendly 400s, then verifies the saved files' contents. */
function guarded(middleware: RequestHandler, maxMb: number, label: string): RequestHandler {
  return (req, res, next) => {
    middleware(req, res, (err?: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          const message =
            err.code === 'LIMIT_FILE_SIZE'
              ? `The ${label} is too large. The limit is ${maxMb} MB.`
              : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
                ? 'Too many files in one upload'
                : 'The upload could not be read';
          next(new HttpError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, message));
          return;
        }
        next(err);
        return;
      }
      const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : [];
      verifyFiles(files).then(() => next(), next);
    });
  };
}

export const uploadImages = (field: string, max: number) => guarded(imageMulter.array(field, max), env.MAX_UPLOAD_MB, 'image');
export const uploadSlip = (field: string) => guarded(slipMulter.single(field), env.SLIP_MAX_MB, 'slip');

/** Resolves a stored private path (e.g. `slips/FBS-...jpg`) to an absolute path, refusing anything outside the dir. */
export function privateFilePath(rel: string): string | null {
  const abs = path.resolve(env.privateUploadDir, rel);
  return abs.startsWith(env.privateUploadDir + path.sep) ? abs : null;
}

export function toPrivatePath(absPath: string): string {
  return path.relative(env.privateUploadDir, absPath).split(path.sep).join('/');
}

/** Converts an absolute file path inside the upload dir to its public `/uploads/...` path. */
export function toPublicPath(absPath: string): string {
  const rel = path.relative(env.uploadDir, absPath).split(path.sep).join('/');
  return `/uploads/${rel}`;
}
