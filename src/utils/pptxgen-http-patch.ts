/**
 * pptxgenjs (Node) downloads remote media with `https.get` for any URL that
 * starts with "http", so plain `http://` throws ERR_INVALID_PROTOCOL.
 *
 * Patch the real `node:https` module so http:// uses `http.get` and https://
 * stays on `https.get`. Never upgrade http → https.
 *
 * Uses createRequire so we mutate the cached module exports (not a TS
 * `import *` namespace object, which only exposes getters).
 */

import { createRequire } from 'node:module';
import type * as Http from 'node:http';
import type * as Https from 'node:https';

const nodeRequire = createRequire(__filename);
const http = nodeRequire('node:http') as typeof Http;
const https = nodeRequire('node:https') as typeof Https;

let patched = false;

function requestUrlString(target: unknown): string {
  if (typeof target === 'string') return target;
  if (target instanceof URL) return target.href;
  if (target && typeof target === 'object') {
    const opts = target as {
      href?: string;
      protocol?: string;
      hostname?: string;
      host?: string;
      path?: string;
      pathname?: string;
      search?: string;
    };
    if (typeof opts.href === 'string') return opts.href;
    if (typeof opts.protocol === 'string') {
      const host = opts.host ?? opts.hostname ?? '';
      const pathPart = opts.path ?? `${opts.pathname ?? ''}${opts.search ?? ''}`;
      return `${opts.protocol}//${host}${pathPart}`;
    }
  }
  return '';
}

/**
 * Enable http:// media downloads inside pptxgenjs (images and any other
 * remote rel.path it embeds). Idempotent.
 */
export function ensurePptxgenAllowsHttp(): void {
  if (patched) return;
  patched = true;

  const originalGet = https.get.bind(https) as typeof https.get;

  const routedGet = ((...args: Parameters<typeof https.get>) => {
    const urlStr = requestUrlString(args[0]);
    if (urlStr.startsWith('http://')) {
      return (http.get as typeof https.get)(...args);
    }
    return originalGet(...args);
  }) as typeof https.get;

  https.get = routedGet;
}
