let muteDepth = 0;
let savedLog: typeof console.log;
let savedWarn: typeof console.warn;

/**
 * Suppress console.log / console.warn for the duration of fn when quiet is true.
 * Supports nested calls via a depth counter.
 */
export async function runQuietly<T>(
  quiet: boolean,
  fn: () => Promise<T>
): Promise<T> {
  if (!quiet) {
    return fn();
  }

  if (muteDepth === 0) {
    savedLog = console.log;
    savedWarn = console.warn;
    console.log = () => {};
    console.warn = () => {};
  }
  muteDepth += 1;

  try {
    return await fn();
  } finally {
    muteDepth -= 1;
    if (muteDepth === 0) {
      console.log = savedLog;
      console.warn = savedWarn;
    }
  }
}
