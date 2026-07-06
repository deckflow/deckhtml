/**
 * Browser login flow with local callback server
 */

import http from 'http';

const LOGIN_TIMEOUT = 300_000;
const DEFAULT_PORT = 3737;

function isChinesePreferredLanguage(
  acceptLanguageHeader: string | string[] | undefined
): boolean {
  const raw = Array.isArray(acceptLanguageHeader)
    ? acceptLanguageHeader.join(',')
    : (acceptLanguageHeader ?? '');
  return raw.toLowerCase().includes('zh');
}

function isChineseCliLocale(): boolean {
  const locale =
    process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
  return locale.toLowerCase().includes('zh');
}

async function openBrowser(url: string): Promise<void> {
  const { default: open } = await import('open');
  await open(url);
}

function startCallbackServer(
  port: number
): Promise<{ token: string; spaceId?: string; server: http.Server }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutHandle: NodeJS.Timeout;

    const settleResolve = (value: {
      token: string;
      spaceId?: string;
      server: http.Server;
    }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve(value);
    };

    const settleReject = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      reject(error);
    };

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost:${port}`);
      const token = url.searchParams.get('token');
      const spaceId =
        url.searchParams.get('spaceId') ||
        url.searchParams.get('space_id') ||
        undefined;
      const isZh = isChinesePreferredLanguage(req.headers['accept-language']);
      const pageTitle = isZh ? '登录成功' : 'Login Successful';
      const pageHeading = isZh ? '登录成功！' : 'Login Successful!';
      const pageDescription = isZh
        ? '你可以关闭此窗口并返回终端。'
        : 'You can close this window and return to your terminal.';

      if (token) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${pageTitle}</title></head><body><h1>${pageHeading}</h1><p>${pageDescription}</p></body></html>`);
        settleResolve({ token, spaceId: spaceId || undefined, server });
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing token parameter');
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        settleReject(
          new Error(
            `Port ${port} is already in use. Please close other applications and try again.`
          )
        );
      } else {
        settleReject(err);
      }
    });

    server.listen(port);

    timeoutHandle = setTimeout(() => {
      server.close();
      settleReject(new Error('Login timeout. Please try again.'));
    }, LOGIN_TIMEOUT);
  });
}

function startRedirectServer(
  port: number
): Promise<{ server: http.Server }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutHandle: NodeJS.Timeout;

    const settleResolve = (value: { server: http.Server }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve(value);
    };

    const settleReject = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      reject(error);
    };

    const server = http.createServer((req, res) => {
      const isZh = isChinesePreferredLanguage(req.headers['accept-language']);
      const pageTitle = isZh ? '完成' : 'Done';
      const pageHeading = isZh ? '完成' : 'Done';
      const pageDescription = isZh
        ? '你可以关闭此窗口并返回终端。'
        : 'You can close this window and return to your terminal.';

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${pageTitle}</title></head><body><h1>${pageHeading}</h1><p>${pageDescription}</p></body></html>`);
      settleResolve({ server });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        settleReject(
          new Error(
            `Port ${port} is already in use. Please close other applications and try again.`
          )
        );
      } else {
        settleReject(err);
      }
    });

    server.listen(port);

    timeoutHandle = setTimeout(() => {
      server.close();
      settleReject(new Error('Operation timeout. Please try again.'));
    }, LOGIN_TIMEOUT);
  });
}

function normalizeLoginBase(apiBase: string): string {
  const u = new URL(apiBase);
  u.pathname = u.pathname.replace(/\/v1\/?$/, '/');
  return `${u.origin}${u.pathname}`.replace(/\/$/, '');
}

export function buildLoginUrl(apiBase: string, callbackUrl: string): string {
  const loginBase = normalizeLoginBase(apiBase);
  return `${loginBase}/cli/auth?redirect_url=${encodeURIComponent(callbackUrl)}`;
}

export function buildCheckoutUrl(options: {
  apiBase: string;
  redirectUrl: string;
  token: string;
  spaceId?: string;
}): string {
  const base = normalizeLoginBase(options.apiBase);
  const u = new URL(`${base}/cli/checkout`);
  u.searchParams.set('redirect_url', options.redirectUrl);
  u.searchParams.set('token', options.token);
  if (options.spaceId) {
    u.searchParams.set('spaceId', options.spaceId);
  }
  return u.toString();
}

export async function runLoginFlow(options: {
  apiBase: string;
  port: number;
  jsonOutput: boolean;
  reason?: 'explicit' | 'unauthorized';
}): Promise<{ token: string; spaceId?: string }> {
  const isZh = isChineseCliLocale();
  const callbackUrl = `http://localhost:${options.port}`;
  const loginUrl = buildLoginUrl(options.apiBase, callbackUrl);

  if (!options.jsonOutput) {
    if (options.reason === 'unauthorized') {
      console.error(
        isZh
          ? '\n认证已失效，需要重新登录。\n'
          : '\nAuthentication expired. Please log in again.\n'
      );
    } else {
      console.error(isZh ? '\n🔐 DeckHTML 登录\n' : '\n🔐 DeckHTML Login\n');
    }
    console.error(`Opening browser to: ${loginUrl}`);
    console.error(
      `Waiting for authentication on port ${options.port}...\n`
    );
  }

  const serverPromise = startCallbackServer(options.port);

  try {
    await openBrowser(loginUrl);
  } catch {
    if (!options.jsonOutput) {
      console.error(
        isZh
          ? '\n无法自动打开浏览器，请手动打开此链接：\n'
          : '\nUnable to open browser automatically. Please open this link:\n'
      );
      console.error(`${loginUrl}\n`);
    }
  }

  const { token, spaceId, server } = await serverPromise;
  server.close();

  if (!options.jsonOutput) {
    console.error('Login successful!\n');
  }

  return { token, spaceId };
}

export async function runCheckoutFlow(options: {
  apiBase: string;
  port: number;
  jsonOutput: boolean;
  token: string;
  spaceId?: string;
}): Promise<void> {
  const isZh = isChineseCliLocale();
  const redirectUrl = `http://localhost:${options.port}`;
  const checkoutUrl = buildCheckoutUrl({
    apiBase: options.apiBase,
    redirectUrl,
    token: options.token,
    spaceId: options.spaceId,
  });

  if (!options.jsonOutput) {
    console.error(
      isZh
        ? '\n余额不足，需要购买后继续。\n'
        : '\nInsufficient balance. Please complete payment to continue.\n'
    );
    console.error(`Opening browser to: ${checkoutUrl}`);
    console.error(
      `Waiting for checkout completion on port ${options.port}...\n`
    );
  }

  const serverPromise = startRedirectServer(options.port);

  try {
    await openBrowser(checkoutUrl);
  } catch {
    if (!options.jsonOutput) {
      console.error(
        isZh
          ? '\n无法自动打开浏览器，请手动打开此链接：\n'
          : '\nUnable to open browser automatically. Please open this link:\n'
      );
      console.error(`${checkoutUrl}\n`);
    }
  }

  const { server } = await serverPromise;
  server.close();

  if (!options.jsonOutput) {
    console.error('Checkout completed!\n');
  }
}

export { DEFAULT_PORT };
