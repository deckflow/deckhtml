type AxiosLikeError = {
  isAxiosError?: boolean;
  config?: {
    method?: string;
    url?: string;
    baseURL?: string;
  };
  response?: {
    status?: number;
    data?: unknown;
    headers?: Record<string, unknown>;
  };
};

type DeckApiError = Error & {
  statusCode?: number;
  responseData?: unknown;
  requestId?: string;
  requestUrl?: string;
  method?: string;
  fromAxiosError?: (error: unknown) => DeckApiError;
  __deckhtmlPatched?: boolean;
};

export interface ApiErrorDetails {
  message: string;
  requestUrl?: string;
  method?: string;
  statusCode?: number;
  requestId?: string;
  responseData?: unknown;
}

let apiErrorPatchInstalled = false;

function isAxiosLikeError(error: unknown): error is AxiosLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as AxiosLikeError).isAxiosError === true
  );
}

function resolveRequestUrl(config?: AxiosLikeError['config']): string | undefined {
  if (!config?.url) return undefined;
  const { url, baseURL } = config;
  if (/^https?:\/\//i.test(url)) return url;
  if (baseURL) {
    return `${baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  }
  return url;
}

function extractRequestId(headers?: Record<string, unknown>): string | undefined {
  if (!headers) return undefined;
  const direct =
    headers['x-request-id'] ??
    headers['X-RequestId'] ??
    headers['x-requestid'];
  return typeof direct === 'string' && direct.trim() ? direct.trim() : undefined;
}

function parseRouteFromMessage(message: string): { method?: string; path?: string } {
  const match = message.match(/Route (GET|POST|PUT|DELETE|PATCH):(\S+)/i);
  if (!match) return {};
  return { method: match[1]!.toUpperCase(), path: match[2] };
}

export function buildRequestUrl(
  apiBase: string | undefined,
  details: Pick<ApiErrorDetails, 'requestUrl' | 'message'>
): string | undefined {
  if (details.requestUrl) return details.requestUrl;
  if (!apiBase) return undefined;

  const { method, path } = parseRouteFromMessage(details.message);
  if (!path) return undefined;

  const normalizedBase = apiBase.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${normalizedBase}${normalizedPath}`;
  return method ? `${method} ${url}` : url;
}

export function toApiErrorDetails(
  error: unknown,
  apiBase?: string
): ApiErrorDetails | undefined {
  if (!(error instanceof Error) || error.name !== 'APIError') {
    return undefined;
  }

  const apiError = error as Error & {
    statusCode?: number;
    responseData?: unknown;
    requestId?: string;
    requestUrl?: string;
    method?: string;
  };

  const requestUrl = buildRequestUrl(apiBase, {
    message: apiError.message,
    requestUrl: apiError.requestUrl,
  });

  return {
    message: apiError.message,
    requestUrl,
    method: apiError.method,
    statusCode: apiError.statusCode,
    requestId: apiError.requestId,
    responseData: apiError.responseData,
  };
}

export function formatApiErrorLines(
  details: ApiErrorDetails,
  apiBase?: string
): string[] {
  const lines: string[] = [];
  const requestUrl = buildRequestUrl(apiBase, details);

  if (requestUrl) {
    lines.push(`Request: ${requestUrl}`);
  } else if (apiBase) {
    lines.push(`API base: ${apiBase}`);
  }

  if (details.statusCode !== undefined) {
    lines.push(`Status: ${details.statusCode}`);
  }

  if (details.requestId) {
    lines.push(`X-RequestId: ${details.requestId}`);
  }

  if (details.responseData !== undefined) {
    lines.push(
      `Response: ${JSON.stringify(details.responseData, null, 2)}`
    );
  }

  return lines;
}

export async function installApiErrorCapture(options: {
  logRequests?: boolean;
} = {}): Promise<void> {
  if (apiErrorPatchInstalled) return;

  const sdk = await import('@deckops/sdk');
  const APIErrorClass = sdk.APIError as unknown as DeckApiError & {
    fromAxiosError: (error: unknown) => DeckApiError;
  };

  if (APIErrorClass.__deckhtmlPatched) {
    apiErrorPatchInstalled = true;
    return;
  }

  const originalFromAxiosError = APIErrorClass.fromAxiosError.bind(APIErrorClass);

  APIErrorClass.fromAxiosError = (error: unknown) => {
    const apiError = originalFromAxiosError(error);

    if (isAxiosLikeError(error)) {
      const requestUrl = resolveRequestUrl(error.config);
      const method = error.config?.method?.toUpperCase();
      const enriched = apiError as DeckApiError;

      if (requestUrl) {
        enriched.requestUrl = requestUrl;
      }
      if (method) {
        enriched.method = method;
      }

      if (options.logRequests) {
        const label = method && requestUrl ? `${method} ${requestUrl}` : requestUrl;
        if (label) {
          console.error(`→ ${label}`);
        }
        if (error.response) {
          console.error(
            `← ${error.response.status ?? 'unknown'} ${requestUrl ?? ''}`.trim()
          );
          if (error.response.data !== undefined) {
            console.error(
              `Response: ${JSON.stringify(error.response.data, null, 2)}`
            );
          }
          const requestId = extractRequestId(error.response.headers);
          if (requestId) {
            console.error(`X-RequestId: ${requestId}`);
          }
        }
      }
    }

    return apiError;
  };

  APIErrorClass.__deckhtmlPatched = true;
  apiErrorPatchInstalled = true;
}

export function shouldLogHttpRequests(verbose: boolean): boolean {
  return verbose || process.env.DECKHTML_DEBUG_HTTP === '1';
}
