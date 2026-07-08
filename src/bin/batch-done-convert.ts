#!/usr/bin/env ts-node

/**
 * Convert all HTML files in a benchmark/done subdirectory (sorted by name)
 * into a single out.pptx in that directory.
 *
 * Usage:
 *   ./src/bin/batch-done-convert.ts <dir> [local] [1280x720]
 *
 * Examples:
 *   ./src/bin/batch-done-convert.ts benchmark/done/0001
 *   ./src/bin/batch-done-convert.ts 0001 local
 */

import { existsSync, readdirSync, statSync, writeFileSync } from 'fs';
import path, { resolve } from 'path';
import { convertHtmlToPptx } from '../api';

const root = resolve(__dirname, '..', '..');
const DONE_ROOT = resolve(root, 'benchmark/done');

function parseViewportArg(arg: string | undefined): { width: number; height: number } {
  if (!arg) return { width: 1280, height: 720 };
  const match = arg.match(/^(\d+)x(\d+)$/i);
  if (!match) {
    throw new Error(`Invalid viewport: ${arg}. Expected WxH e.g. 1280x720`);
  }
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
}

function resolveDoneDir(dirArg: string): string {
  const candidate = resolve(process.cwd(), dirArg);
  if (existsSync(candidate)) {
    if (!statSync(candidate).isDirectory()) {
      throw new Error(`Not a directory: ${candidate}`);
    }
    return candidate;
  }

  const underDone = resolve(DONE_ROOT, dirArg);
  if (existsSync(underDone) && statSync(underDone).isDirectory()) {
    return underDone;
  }

  throw new Error(`Directory not found: ${dirArg} (tried ${candidate} and ${underDone})`);
}

function listHtmlFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.html'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((name) => resolve(dir, name));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const dirArg = args[0];

  if (!dirArg || dirArg === '-h' || dirArg === '--help') {
    console.log(
      'Usage: ./src/bin/batch-done-convert.ts <dir> [local] [1280x720]\n' +
        '  <dir>   Path under benchmark/done (e.g. 0001) or absolute path\n' +
        '  local   Allow file:// subresources\n' +
        '  WxH     Viewport size, default 1280x720\n' +
        '\n' +
        'All .html files in the directory are merged in name order into out.pptx.'
    );
    process.exit(dirArg ? 0 : 1);
  }

  const allowLocalResources = args.includes('local');
  const viewportArg = args.find((a) => /^\d+x\d+$/i.test(a));
  const viewport = parseViewportArg(viewportArg);

  const targetDir = resolveDoneDir(dirArg);
  const htmlFiles = listHtmlFiles(targetDir);

  if (htmlFiles.length === 0) {
    console.log(`No .html files found in ${targetDir}`);
    process.exit(0);
  }

  const outputPath = resolve(targetDir, 'out.pptx');

  console.log(`Directory: ${targetDir}`);
  console.log(`HTML files (${htmlFiles.length}, merged in order):`);
  htmlFiles.forEach((file, i) => {
    console.log(`  ${String(i + 1).padStart(3, ' ')}. ${path.basename(file)}`);
  });
  console.log(`Output:    ${outputPath}`);
  console.log(`Viewport:  ${viewport.width}×${viewport.height}px`);
  if (allowLocalResources) console.log('Local resources: allowed');
  console.log('');

  const startTime = Date.now();
  console.log('Converting...');

  const result = await convertHtmlToPptx({
    inputs: htmlFiles,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    allowLocalResources,
  });

  writeFileSync(outputPath, result.data);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! ${result.slideCount} slide(s) → ${outputPath} (${elapsed}s)`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
