import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';

export const UPLOADS_DIR = join(process.cwd(), 'uploads');

function normalizeUrlPrefix(value: string): string {
  const trimmed = value.trim().replace(/^\/*|\/*$/g, '');
  return trimmed ? `/${trimmed}` : '/uploads';
}

export const PUBLIC_UPLOADS_PREFIX = normalizeUrlPrefix(
  process.env.PUBLIC_UPLOADS_PREFIX || '/uploads',
);

function ensureUploadsDir(): void {
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export const imageUploadOptions = {
  storage: diskStorage({
    destination: (_request, _file, callback) => {
      ensureUploadsDir();
      callback(null, UPLOADS_DIR);
    },
    filename: (_request, file, callback) => {
      const extension = extname(file.originalname) || '.png';
      const name = `${Date.now()}-${Math.round(Math.random() * 1_000_000_000)}${extension}`;
      callback(null, name);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
};

export function buildUploadUrl(filename: string): string {
  return `${PUBLIC_UPLOADS_PREFIX}/${filename}`;
}

export function resolveLocalUploadPath(imageUrl: string): string | null {
  const prefixes = ['/uploads', PUBLIC_UPLOADS_PREFIX];
  const prefix = prefixes.find((candidate) => imageUrl.startsWith(`${candidate}/`));
  if (!prefix) return null;

  const filename = imageUrl.slice(prefix.length + 1);
  if (!filename || filename.includes('/') || filename.includes('\\')) return null;
  return join(UPLOADS_DIR, filename);
}
