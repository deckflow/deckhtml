/**
 * Browser login flow with local callback server
 */

import http from 'http';

const LOGIN_TIMEOUT = 300_000;
const DEFAULT_PORT = 3737;

type UiLocale = 'zh' | 'en';

function resolveBrowserLocale(
  acceptLanguageHeader: string | string[] | undefined,
  queryLang?: string | null
): UiLocale {
  const override = (queryLang || '').trim().toLowerCase();
  if (override.startsWith('zh')) return 'zh';
  if (override.startsWith('en')) return 'en';

  const raw = Array.isArray(acceptLanguageHeader)
    ? acceptLanguageHeader.join(',')
    : (acceptLanguageHeader ?? '');
  return raw.toLowerCase().includes('zh') ? 'zh' : 'en';
}

function isChineseCliLocale(): boolean {
  const locale =
    process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
  return locale.toLowerCase().includes('zh');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderStatusPage(options: {
  locale: UiLocale;
  title: string;
  heading: string;
  description: string;
}): string {
  const lang = options.locale === 'zh' ? 'zh-CN' : 'en';
  const title = escapeHtml(options.title);
  const heading = escapeHtml(options.heading);
  const description = escapeHtml(options.description);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root {
      --bg-0: #f3f7f4;
      --bg-1: #e7f0ea;
      --ink: #163028;
      --muted: #5b7266;
      --accent: #1f8a5b;
      --accent-soft: #d8f0e3;
      --ring: rgba(31, 138, 91, 0.28);
      --panel: rgba(255, 255, 255, 0.72);
    }

    * { box-sizing: border-box; }

    html, body {
      height: 100%;
      margin: 0;
    }

    body {
      font-family: "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC",
        "Microsoft YaHei", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 600px at 12% -10%, #dff3e8 0%, transparent 55%),
        radial-gradient(900px 520px at 100% 0%, #dce9f4 0%, transparent 50%),
        linear-gradient(160deg, var(--bg-0), var(--bg-1));
      display: grid;
      place-items: center;
      padding: 24px;
    }

    main {
      width: min(100%, 420px);
      text-align: center;
      padding: 40px 32px 36px;
      border-radius: 24px;
      background: var(--panel);
      border: 1px solid rgba(22, 48, 40, 0.08);
      backdrop-filter: blur(10px);
      box-shadow: 0 18px 50px rgba(22, 48, 40, 0.08);
      animation: rise 420ms ease-out both;
    }

    .brand {
      margin: 0 0 22px;
      font-size: 13px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 600;
    }

    .mark {
      width: 72px;
      height: 72px;
      margin: 0 auto 22px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--accent-soft);
      box-shadow: 0 0 0 8px var(--ring);
      animation: pop 480ms cubic-bezier(0.2, 0.9, 0.2, 1.2) both;
    }

    .mark svg {
      width: 34px;
      height: 34px;
    }

    .mark path {
      fill: none;
      stroke: var(--accent);
      stroke-width: 3.2;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 48;
      stroke-dashoffset: 48;
      animation: draw 520ms 180ms ease forwards;
    }

    h1 {
      margin: 0 0 10px;
      font-size: clamp(1.55rem, 2.4vw, 1.85rem);
      line-height: 1.25;
      letter-spacing: -0.02em;
      font-weight: 700;
    }

    p {
      margin: 0;
      color: var(--muted);
      font-size: 0.98rem;
      line-height: 1.55;
    }

    @keyframes rise {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes pop {
      from { opacity: 0; transform: scale(0.82); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes draw {
      to { stroke-dashoffset: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      main, .mark, .mark path { animation: none; }
      .mark path { stroke-dashoffset: 0; }
    }
  </style>
</head>
<body>
  <main>
    <p class="brand">DeckHTML</p>
    <div class="mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <path d="M5 12.5l4.2 4.2L19 7.5"></path>
      </svg>
    </div>
    <h1>${heading}</h1>
    <p>${description}</p>
  </main>
</body>
</html>`;
}

function statusCopy(
  kind: 'login' | 'checkout',
  locale: UiLocale
): { title: string; heading: string; description: string } {
  if (kind === 'login') {
    return locale === 'zh'
      ? {
          title: '登录成功',
          heading: '登录成功',
          description: '你可以关闭此窗口并返回终端。',
        }
      : {
          title: 'Login Successful',
          heading: 'Login successful',
          description:
            'You can close this window and return to your terminal.',
        };
  }

  return locale === 'zh'
    ? {
        title: '完成',
        heading: '支付完成',
        description: '你可以关闭此窗口并返回终端。',
      }
    : {
        title: 'Done',
        heading: 'Checkout complete',
        description: 'You can close this window and return to your terminal.',
      };
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
      const locale = resolveBrowserLocale(
        req.headers['accept-language'],
        url.searchParams.get('lang')
      );
      const copy = statusCopy('login', locale);

      if (token) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderStatusPage({ locale, ...copy }));
        settleResolve({ token, spaceId: spaceId || undefined, server });
      } else {
        const message =
          locale === 'zh' ? '缺少 token 参数' : 'Missing token parameter';
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(message);
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
      const url = new URL(req.url || '', `http://localhost:${port}`);
      const locale = resolveBrowserLocale(
        req.headers['accept-language'],
        url.searchParams.get('lang')
      );
      const copy = statusCopy('checkout', locale);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderStatusPage({ locale, ...copy }));
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
  reason?: 'explicit' | 'unauthorized' | 'guest-limit';
}): Promise<{ token: string; spaceId?: string }> {
  const isZh = isChineseCliLocale();
  const callbackUrl = `http://localhost:${options.port}`;
  const loginUrl = buildLoginUrl(options.apiBase, callbackUrl);

  if (!options.jsonOutput) {
    if (options.reason === 'guest-limit') {
      console.error(
        isZh
          ? '\n游客模式的云端使用次数已达上限（或云端已要求登录）。登录或配置 API Key 后即可继续。\n'
          : '\nGuest cloud usage limit reached (or sign-in is now required). Log in or set an API key to continue.\n'
      );
      console.error(
        isZh
          ? '提示：也可以直接运行 `deckhtml config set api-key <key>` 配置 API Key，无需浏览器登录。\n'
          : 'Tip: you can also run `deckhtml config set api-key <key>` to set an API key without browser login.\n'
      );
    } else if (options.reason === 'unauthorized') {
      console.error(
        isZh
          ? '\n认证已失效，需要重新登录。\n'
          : '\nAuthentication expired. Please log in again.\n'
      );
    } else {
      console.error(isZh ? '\n🔐 DeckHTML 登录\n' : '\n🔐 DeckHTML Login\n');
    }
    console.error(
      isZh ? `正在打开浏览器：${loginUrl}` : `Opening browser to: ${loginUrl}`
    );
    console.error(
      isZh
        ? `等待端口 ${options.port} 上的认证回调…\n`
        : `Waiting for authentication on port ${options.port}...\n`
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
    console.error(isZh ? '登录成功！\n' : 'Login successful!\n');
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
    console.error(
      isZh
        ? `正在打开浏览器：${checkoutUrl}`
        : `Opening browser to: ${checkoutUrl}`
    );
    console.error(
      isZh
        ? `等待端口 ${options.port} 上的支付完成回调…\n`
        : `Waiting for checkout completion on port ${options.port}...\n`
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
    console.error(isZh ? '支付完成！\n' : 'Checkout completed!\n');
  }
}

export { DEFAULT_PORT };
