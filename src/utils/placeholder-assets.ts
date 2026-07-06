/**
 * Placeholder images for unavailable media resources.
 *
 * Resolution order (per media type):
 * 1. Custom directory — PLACEHOLDER_ASSETS_DIR env var, if set
 * 2. Package defaults — assets/placeholders/ at package root
 * 3. Built-in embedded PNGs — #eeeeee defaults shipped in code
 */

import fs from 'node:fs';
import path from 'node:path';
import { EMBEDDED_DEFAULT_PLACEHOLDERS } from './placeholder-defaults';

export type PlaceholderMediaType = 'image' | 'video' | 'audio';

const PLACEHOLDER_FILENAMES: Record<PlaceholderMediaType, string> = {
  image: 'image-unavailable.png',
  video: 'video-unavailable.png',
  audio: 'audio-unavailable.png',
};

const dataUrlCache = new Map<PlaceholderMediaType, string>();

/** Package-bundled PNG directory (user-replaceable without rebuild). */
export function resolveDefaultPlaceholderAssetsDir(): string {
  return path.join(__dirname, '..', '..', 'assets', 'placeholders');
}

/**
 * Directories to try, in order. Custom dir first when configured.
 */
export function resolvePlaceholderSearchDirs(): string[] {
  const dirs: string[] = [];
  if (process.env.PLACEHOLDER_ASSETS_DIR) {
    dirs.push(path.resolve(process.env.PLACEHOLDER_ASSETS_DIR));
  }
  const defaultDir = resolveDefaultPlaceholderAssetsDir();
  if (!dirs.includes(defaultDir)) {
    dirs.push(defaultDir);
  }
  return dirs;
}

function tryLoadPngFromDir(dir: string, type: PlaceholderMediaType): string | null {
  const filePath = path.join(dir, PLACEHOLDER_FILENAMES[type]);
  try {
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function loadPlaceholderDataUrl(type: PlaceholderMediaType): string {
  const cached = dataUrlCache.get(type);
  if (cached) return cached;

  for (const dir of resolvePlaceholderSearchDirs()) {
    const fromFile = tryLoadPngFromDir(dir, type);
    if (fromFile) {
      dataUrlCache.set(type, fromFile);
      return fromFile;
    }
  }

  const embedded = EMBEDDED_DEFAULT_PLACEHOLDERS[type];
  dataUrlCache.set(type, embedded);
  return embedded;
}

export function getPlaceholderForMediaType(type: PlaceholderMediaType): string {
  return loadPlaceholderDataUrl(type);
}
