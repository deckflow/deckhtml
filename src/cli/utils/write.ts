/**
 * Atomic, overwrite-safe file writing for the deckhtml CLI (DH-P0-008).
 *
 * Default policy: refuse to overwrite an existing file. Pass `overwrite: true`
 * (or use the CLI `--force` flag) to allow it. Writes always go to a temp file
 * in the same directory, then atomically renamed onto the target so a crash
 * never leaves a partially-written output.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export class OutputExistsError extends Error {
  readonly ruleId = 'DECKHTML_OUTPUT_EXISTS';
  constructor(readonly target: string) {
    super(
      `Refusing to overwrite existing file: ${target}. Re-run with --force to overwrite.`,
    );
    this.name = 'OutputExistsError';
  }
}

export interface AtomicWriteOptions {
  /** When true, overwrite an existing target file. Default: false (refuse). */
  overwrite?: boolean;
}

/**
 * Write `data` to `target` atomically. Refuses to overwrite by default.
 */
export async function atomicWriteFile(
  target: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const overwrite = options.overwrite ?? false;
  if (!overwrite) {
    let exists = false;
    try {
      await fs.access(target);
      exists = true;
    } catch {
      exists = false;
    }
    if (exists) {
      throw new OutputExistsError(target);
    }
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}
