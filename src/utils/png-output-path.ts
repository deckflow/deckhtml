import path from 'path';

/**
 * Build output PNG path(s) from the `-o` base path.
 *
 * - 1 page: same as base (ensures `.png`)
 * - N pages: insert a 1-based index before the extension
 *   (width = digit count of N: 1–9 → `1`…`9`, 10–99 → `01`…`99`, …)
 */
export function buildPngOutputPaths(basePath: string, count: number): string[] {
  if (count < 1) {
    throw new Error('PNG page count must be at least 1.');
  }

  const resolved = path.resolve(basePath);
  const parsed = path.parse(resolved);
  const hasPngExt = parsed.ext.toLowerCase() === '.png';
  const dir = parsed.dir;
  const name = hasPngExt ? parsed.name : parsed.base || 'frames';
  const ext = hasPngExt ? (parsed.ext || '.png') : '.png';

  if (count === 1) {
    return [path.join(dir, `${name}${ext}`)];
  }

  const width = String(count).length;
  return Array.from({ length: count }, (_, i) => {
    const index = String(i + 1).padStart(width, '0');
    return path.join(dir, `${name}${index}${ext}`);
  });
}
