import {
  formatApiErrorLines,
  toApiErrorDetails,
} from './api-error';

export const ExitCode = {
  SUCCESS: 0,
  ERROR: 1,
  USAGE_ERROR: 2,
} as const;

export interface OutputErrorOptions {
  apiBase?: string;
}

export function outputError(
  error: Error,
  jsonMode: boolean,
  code = 'ERROR',
  options: OutputErrorOptions = {}
): void {
  const apiDetails = toApiErrorDetails(error, options.apiBase);

  if (jsonMode) {
    console.error(
      JSON.stringify({
        ok: false,
        error: {
          code,
          message: error.message,
          ...(apiDetails
            ? {
                requestUrl: apiDetails.requestUrl,
                statusCode: apiDetails.statusCode,
                requestId: apiDetails.requestId,
                response: apiDetails.responseData,
              }
            : {}),
        },
      })
    );
    return;
  }

  console.error(`Error: ${error.message}`);
  if (apiDetails) {
    for (const line of formatApiErrorLines(apiDetails, options.apiBase)) {
      console.error(line);
    }
  }
}
