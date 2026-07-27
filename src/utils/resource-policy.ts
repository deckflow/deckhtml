/**
 * Resource loading policy for Playwright and PPTX media validation (DH-P0-007).
 *
 * Caller controls network access and local file roots. Blocked, missing, and
 * escaped resources are reported as structured diagnostics instead of being
 * silently allowed or denied.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { Page, Route } from 'playwright-core';

/** Timeout for remote media probe/download used before pptxgenjs embed. */
const REMOTE_MEDIA_TIMEOUT_MS = 30_000;

export type ResourcePolicyMode = 'local' | 'remote';

export interface DocumentUrlInfo {
  documentUrl: string;
  mode: ResourcePolicyMode;
}

/** Structured per-resource diagnostic. */
export interface ResourceDiagnostic {
  rule_id: string;
  severity: 'error' | 'warning' | 'info';
  url: string;
  message: string;
  recovery?: string;
}

/**
 * Caller-controlled resource policy.
 */
export interface ResourcePolicy {
  /** 'deny' blocks http://, https://, ws://, wss://. Default: 'allow' (backward compat). */
  network?: 'deny' | 'allow';
  /** Local file roots that file:// subresources may load from. Empty = only the document itself. */
  allowedRoots?: string[];
  /** When false, reject symlinks and '..' traversal. Default: false. */
  followSymlinks?: boolean;
  /** Allow remote fonts. Defaults to network policy. */
  allowRemoteFonts?: boolean;
  /** Allow remote images. Defaults to network policy. */
  allowRemoteImages?: boolean;
  /** Allow remote scripts. Defaults to network policy. */
  allowRemoteScripts?: boolean;
  /** Allow remote styles. Defaults to network policy. */
  allowRemoteStyles?: boolean;
}

export interface ResourcePolicyOptions {
  /** Legacy shorthand: when true, allow all file:// subresources (no route blocking). */
  allowLocalResources?: boolean;
  /** Explicit policy. When present, takes precedence over allowLocalResources. */
  policy?: ResourcePolicy;
  /** Diagnostics collector (pushed to by the route handler). */
  diagnostics?: ResourceDiagnostic[];
}

const RULE_REMOTE_BLOCKED = 'DECKHTML_REMOTE_RESOURCE_BLOCKED';
const RULE_FILE_OUTSIDE_ROOTS = 'DECKHTML_FILE_OUTSIDE_ROOTS';
const RULE_SYMLINK_ESCAPE = 'DECKHTML_SYMLINK_ESCAPE';
const RULE_PATH_TRAVERSAL = 'DECKHTML_PATH_TRAVERSAL';

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

function isSymlink(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

function resolveRealPath(filePath: string): string | null {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return null;
  }
}

function containsPathTraversal(filePath: string): boolean {
  // Reject any '..' segment in the raw path before normalization collapses it.
  // This catches both literal '../' traversal and URL-encoded '%2E%2E'.
  const decoded = decodeURIComponent(filePath);
  const segments = decoded.split(/[/\\]/);
  if (segments.includes('..')) return true;
  // Also reject the normalized form escaping above the filesystem root.
  const normalized = path.normalize(decoded);
  const normalizedSegments = normalized.split(/[/\\]/);
  return normalizedSegments.includes('..');
}

function isUnderRoots(filePath: string, roots: string[], followSymlinks: boolean): {
  allowed: boolean;
  reason?: { rule_id: string; message: string; recovery?: string };
} {
  // Check the raw path for traversal BEFORE path.resolve collapses '..'.
  if (containsPathTraversal(filePath)) {
    return {
      allowed: false,
      reason: {
        rule_id: RULE_PATH_TRAVERSAL,
        message: `Path traversal ('..') is not allowed: ${filePath}`,
      },
    };
  }

  const resolved = path.resolve(filePath);

  if (!followSymlinks && isSymlink(resolved)) {
    return {
      allowed: false,
      reason: {
        rule_id: RULE_SYMLINK_ESCAPE,
        message: `Symlink rejected by resource policy: ${filePath}`,
        recovery: 'Set followSymlinks: true or replace the symlink with a real file.',
      },
    };
  }

  // When followSymlinks is true, resolve to the real target before root check.
  const checkedPath = followSymlinks ? (resolveRealPath(resolved) ?? resolved) : resolved;

  if (roots.length === 0) {
    return { allowed: false, reason: { rule_id: RULE_FILE_OUTSIDE_ROOTS, message: `No allowed roots configured; file:// subresource rejected: ${filePath}` } };
  }

  for (const root of roots) {
    const absRoot = path.resolve(root);
    const rel = path.relative(absRoot, checkedPath);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return { allowed: true };
    }
    // Also allow the root itself.
    if (checkedPath === absRoot) return { allowed: true };
  }

  return {
    allowed: false,
    reason: {
      rule_id: RULE_FILE_OUTSIDE_ROOTS,
      message: `File outside allowed roots: ${filePath}`,
      recovery: `Add the file's directory to resourcePolicy.allowedRoots.`,
    },
  };
}

function remoteAllowedForKind(
  kind: 'font' | 'image' | 'script' | 'style' | 'other',
  policy: Required<Pick<ResourcePolicy, 'network' | 'allowRemoteFonts' | 'allowRemoteImages' | 'allowRemoteScripts' | 'allowRemoteStyles'>>,
): boolean {
  if (kind === 'font') return policy.allowRemoteFonts;
  if (kind === 'image') return policy.allowRemoteImages;
  if (kind === 'script') return policy.allowRemoteScripts;
  if (kind === 'style') return policy.allowRemoteStyles;
  return policy.network === 'allow';
}

function classifyRoute(route: Route): 'font' | 'image' | 'script' | 'style' | 'other' {
  const type = route.request().resourceType();
  if (type === 'font') return 'font';
  if (type === 'image') return 'image';
  if (type === 'script') return 'script';
  if (type === 'stylesheet') return 'style';
  // Fallback by URL extension for data/manifest etc.
  const url = route.request().url().toLowerCase();
  if (/\.(woff2?|ttf|otf|eot)(\?|$)/.test(url)) return 'font';
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?|$)/.test(url)) return 'image';
  if (/\.(js|mjs)(\?|$)/.test(url)) return 'script';
  if (/\.css(\?|$)/.test(url)) return 'style';
  return 'other';
}

function normalizePolicy(
  raw: ResourcePolicy | undefined,
  mode: ResourcePolicyMode,
  documentDir: string | null,
): Required<Pick<ResourcePolicy, 'network' | 'allowedRoots' | 'followSymlinks' | 'allowRemoteFonts' | 'allowRemoteImages' | 'allowRemoteScripts' | 'allowRemoteStyles'>> {
  const network = raw?.network ?? 'allow';
  const allowedRoots = raw?.allowedRoots ?? (documentDir ? [documentDir] : []);
  const followSymlinks = raw?.followSymlinks ?? false;
  return {
    network,
    allowedRoots,
    followSymlinks,
    allowRemoteFonts: raw?.allowRemoteFonts ?? network === 'allow',
    allowRemoteImages: raw?.allowRemoteImages ?? network === 'allow',
    allowRemoteScripts: raw?.allowRemoteScripts ?? network === 'allow',
    allowRemoteStyles: raw?.allowRemoteStyles ?? network === 'allow',
  };
}

/**
 * Whether a subresource request should be allowed under the active policy.
 * Pushes a diagnostic for every denial.
 */
export function isResourceRequestAllowed(
  requestUrl: string,
  documentUrl: string,
  policy: Required<Pick<ResourcePolicy, 'network' | 'allowedRoots' | 'followSymlinks' | 'allowRemoteFonts' | 'allowRemoteImages' | 'allowRemoteScripts' | 'allowRemoteStyles'>>,
  diagnostics: ResourceDiagnostic[],
  kind: 'font' | 'image' | 'script' | 'style' | 'other',
): boolean {
  const lower = requestUrl.toLowerCase();

  if (lower.startsWith('data:') || lower.startsWith('blob:')) {
    return true;
  }

  if (lower.startsWith('ws://') || lower.startsWith('wss://')) {
    if (policy.network === 'deny') {
      diagnostics.push({
        rule_id: RULE_REMOTE_BLOCKED,
        severity: 'error',
        url: requestUrl,
        message: 'WebSocket requests are blocked by the active resource policy (network: deny).',
        recovery: 'Set resourcePolicy.network: "allow" to permit WebSocket.',
      });
      return false;
    }
    return true;
  }

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    if (!remoteAllowedForKind(kind, policy)) {
      diagnostics.push({
        rule_id: RULE_REMOTE_BLOCKED,
        severity: 'error',
        url: requestUrl,
        message: `Remote ${kind} resource is not allowed by the active resource policy.`,
        recovery: `Set resourcePolicy.allowRemote${kind[0]!.toUpperCase() + kind.slice(1)}: true or resourcePolicy.network: "allow".`,
      });
      return false;
    }
    return true;
  }

  if (lower.startsWith('file:')) {
    // The document itself is always allowed.
    if (normalizeFileUrl(requestUrl) === normalizeFileUrl(documentUrl)) {
      return true;
    }
    // Check the raw URL for traversal BEFORE fileURLToPath collapses '..'.
    // URL parsing normalizes '..' segments, so we must inspect the original string.
    const rawDecoded = (() => {
      try {
        return decodeURIComponent(requestUrl);
      } catch {
        return requestUrl;
      }
    })();
    if (/(^|[\/\\])\.\.([\/\\]|$)/.test(rawDecoded) || /%2e%2e/i.test(requestUrl)) {
      diagnostics.push({
        rule_id: RULE_PATH_TRAVERSAL,
        severity: 'error',
        url: requestUrl,
        message: `Path traversal ('..') is not allowed: ${requestUrl}`,
      });
      return false;
    }
    let filePath: string;
    try {
      filePath = fileURLToPath(requestUrl);
    } catch {
      diagnostics.push({
        rule_id: RULE_PATH_TRAVERSAL,
        severity: 'error',
        url: requestUrl,
        message: `Unparsable file:// URL rejected: ${requestUrl}`,
      });
      return false;
    }
    const result = isUnderRoots(filePath, policy.allowedRoots, policy.followSymlinks);
    if (!result.allowed && result.reason) {
      diagnostics.push({
        rule_id: result.reason.rule_id,
        severity: 'error',
        url: requestUrl,
        message: result.reason.message,
        recovery: result.reason.recovery,
      });
      return false;
    }
    return true;
  }

  diagnostics.push({
    rule_id: RULE_REMOTE_BLOCKED,
    severity: 'warning',
    url: requestUrl,
    message: `Unsupported resource protocol rejected: ${requestUrl}`,
  });
  return false;
}

/**
 * Playwright route handler enforcing the resource policy.
 */
export function createPlaywrightRouteHandler(
  documentUrl: string,
  policy: Required<Pick<ResourcePolicy, 'network' | 'allowedRoots' | 'followSymlinks' | 'allowRemoteFonts' | 'allowRemoteImages' | 'allowRemoteScripts' | 'allowRemoteStyles'>>,
  diagnostics: ResourceDiagnostic[],
): (route: Route) => Promise<void> {
  return async (route: Route) => {
    const requestUrl = route.request().url();
    const kind = classifyRoute(route);
    if (isResourceRequestAllowed(requestUrl, documentUrl, policy, diagnostics, kind)) {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  };
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
  const documentDir =
    info.mode === 'local'
      ? path.dirname(fileURLToPath(info.documentUrl))
      : null;

  // Explicit policy takes precedence; otherwise map the legacy shorthand.
  let policy: ResourcePolicy;
  if (options?.policy) {
    policy = options.policy;
  } else if (options?.allowLocalResources) {
    // Legacy loose mode: allow all file:// subresources and all remote.
    policy = { network: 'allow', allowedRoots: [], followSymlinks: true };
  } else {
    // Legacy strict-local mode: block file:// subresources except the document.
    policy = { network: 'allow', allowedRoots: [], followSymlinks: false };
  }

  const normalized = normalizePolicy(policy, info.mode, documentDir);
  const diagnostics = options?.diagnostics ?? [];

  // When policy allows everything (loose legacy mode with no roots and network allow),
  // skip route registration to preserve prior performance and behavior.
  const isLoose =
    !options?.policy &&
    options?.allowLocalResources === true;

  if (isLoose) {
    return info;
  }

  await page.route('**/*', createPlaywrightRouteHandler(info.documentUrl, normalized, diagnostics));
  return info;
}

/**
 * Validate that a URL returns a valid image (not 404 HTML, etc.)
 */
export async function validateImageUrl(url: string): Promise<boolean> {
  return (await resolveImageSourceForPptx(url)) !== null;
}

export type ResolvedImageSource =
  | { kind: 'data'; data: string }
  | { kind: 'path'; path: string };

/**
 * Resolve an image URL for pptxgenjs.
 * Keeps the original http:// or https:// URL (no protocol upgrade).
 * Call ensurePptxgenAllowsHttp() before write so pptxgenjs can fetch http://.
 */
export async function resolveImageSourceForPptx(
  url: string
): Promise<ResolvedImageSource | null> {
  if (!url) return null;

  if (url.startsWith('data:')) {
    return validateDataImageUrl(url) ? { kind: 'data', data: url } : null;
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(REMOTE_MEDIA_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('image/')) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const start = buffer.subarray(0, Math.min(50, buffer.length)).toString('utf8');
    if (/^\s*<(!DOCTYPE|html|[\w-]+)/i.test(start)) return null;

    // Pass through original URL (http:// or https://). pptxgenjs downloads it.
    return { kind: 'path', path: url };
  } catch {
    return null;
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
