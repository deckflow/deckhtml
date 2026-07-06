export const ExitCode = {
  SUCCESS: 0,
  ERROR: 1,
  USAGE_ERROR: 2,
} as const;

export function outputError(
  error: Error,
  jsonMode: boolean,
  code = 'ERROR'
): void {
  if (jsonMode) {
    console.error(
      JSON.stringify({
        ok: false,
        error: { code, message: error.message },
      })
    );
    return;
  }
  console.error(`Error: ${error.message}`);
}
