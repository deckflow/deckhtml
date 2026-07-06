import os from 'node:os';

/** Playwright page pool size for multi-slide inspect: CPU cores − 2, at least 1. */
export function resolveSlideInspectConcurrency(): number {
  const cores = os.cpus().length;
  return Math.max(1, cores - 2);
}

/**
 * Run async tasks with a fixed concurrency limit (work-stealing over indices).
 */
export async function runAsyncPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
