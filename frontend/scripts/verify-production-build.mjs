import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = await readFile(path.join(frontendRoot, 'dist', 'index.html'), 'utf8');
const expectedBase = normalizeBase(process.env.VITE_BASE_PATH || '/rightnow/');
const expectedApi = (process.env.VITE_API_BASE_URL || '/rightnow-api').replace(/\/$/, '');
const assetUrls = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((url) => /\.(?:js|css)$/.test(url));

if (assetUrls.length === 0) {
  throw new Error('Production index.html contains no JavaScript or CSS assets.');
}

const expectedAssetPrefix = `${expectedBase}assets/`;
const invalidAsset = assetUrls.find((url) => !url.startsWith(expectedAssetPrefix));
if (invalidAsset) {
  throw new Error(`Production asset URL ${invalidAsset} does not use ${expectedAssetPrefix}.`);
}

const javascript = await Promise.all(
  assetUrls
    .filter((url) => url.endsWith('.js'))
    .map((url) => readFile(path.join(frontendRoot, 'dist', stripBase(url, expectedBase)), 'utf8')),
);
if (!javascript.some((source) => source.includes(expectedApi))) {
  throw new Error(`Production JavaScript does not contain API prefix ${expectedApi}.`);
}

console.log(`production frontend paths: OK (${expectedBase}, ${expectedApi})`);

function normalizeBase(value) {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function stripBase(url, base) {
  return url.slice(base.length);
}
