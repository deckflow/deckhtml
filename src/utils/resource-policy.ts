/**
 * Resource loading policy for Playwright and PPTX media validation.
 * Strict mode: local HTML may only load its own file:// document; all other
 * file:// subresources are blocked. data:, blob:, and http(s): are allowed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { Page, Route } from 'playwright';

export type ResourcePolicyMode = 'local' | 'remote';

export interface DocumentUrlInfo {
  documentUrl: string;
  mode: ResourcePolicyMode;
}

/**
 * Resolve how the HTML document will be loaded.
 */
export function resolveDocumentUrl(inputPath: string): DocumentUrlInfo {
  if (fs.existsSync(inputPath)) {
    const absolutePath = path.resolve(inputPath);
    return {
      documentUrl: pathToFileURL(absolutePath).href,
      mode: 'local',
    };
  }
  return {
    documentUrl: inputPath,
    mode: 'remote',
  };
}

/**
 * Normalize file:// URLs for stable comparison across platforms.
 */
export function normalizeFileUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') return url;
    const filePath = fileURLToPath(parsed);
    const resolved = path.resolve(filePath);
    return pathToFileURL(resolved).href;
  } catch {
    return url;
  }
}

/**
 * Whether a subresource request should be allowed under strict policy.
 */
export function isResourceRequestAllowed(
  requestUrl: string,
  documentUrl: string,
  _mode: ResourcePolicyMode
): boolean {
  const lower = requestUrl.toLowerCase();

  if (lower.startsWith('data:') || lower.startsWith('blob:')) {
    return true;
  }

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return true;
  }

  if (lower.startsWith('file:')) {
    return normalizeFileUrl(requestUrl) === normalizeFileUrl(documentUrl);
  }

  return false;
}

function logBlockedResource(url: string): void {
  console.warn(`🚫 Blocked resource request: ${url}`);
}

/**
 * Playwright route handler enforcing strict file:// policy.
 */
export function createPlaywrightRouteHandler(
  documentUrl: string,
  mode: ResourcePolicyMode
): (route: Route) => Promise<void> {
  return async (route: Route) => {
    const requestUrl = route.request().url();
    if (isResourceRequestAllowed(requestUrl, documentUrl, mode)) {
      await route.continue();
      return;
    }
    logBlockedResource(requestUrl);
    await route.abort('blockedbyclient');
  };
}

export interface ResourcePolicyOptions {
  /** When true, allow all file:// subresources (no route blocking). Default: strict policy. */
  allowLocalResources?: boolean;
}

/**
 * Register resource policy route on a Playwright page (call before goto).
 */
export async function setupResourcePolicyOnPage(
  page: Page,
  inputPath: string,
  options?: ResourcePolicyOptions
): Promise<DocumentUrlInfo> {
  const info = resolveDocumentUrl(inputPath);
  if (!options?.allowLocalResources) {
    await page.route('**/*', createPlaywrightRouteHandler(info.documentUrl, info.mode));
  }
  return info;
}

/**
 * Validate that a URL returns a valid image (not 404 HTML, etc.)
 */
export async function validateImageUrl(url: string): Promise<boolean> {
  if (!url) return false;

  if (url.startsWith('data:')) {
    return validateDataImageUrl(url);
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('image/')) return false;

    const buffer = await response.arrayBuffer();
    const arr = new Uint8Array(buffer);
    const start = String.fromCharCode(...arr.slice(0, Math.min(50, arr.length)));
    if (/^\s*<(!DOCTYPE|html|[\w-]+)/i.test(start)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate inline data:image/... URLs.
 */
export function validateDataImageUrl(dataUrl: string): boolean {
  if (!dataUrl.startsWith('data:image/')) return false;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return false;
  const payload = dataUrl.slice(comma + 1).trim();
  if (payload.length < 16) return false;
  if (dataUrl.includes(';base64,')) {
    return /^[A-Za-z0-9+/=\s]+$/.test(payload) && payload.replace(/\s/g, '').length >= 16;
  }
  return payload.length >= 16;
}
