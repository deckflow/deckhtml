import fs from 'fs/promises';
import path from 'path';
import type { DeckTask } from '../types/sdk';
import type { ConversionStats } from '../../conversion-report';

type OutputFile = {
  url: string;
  ext: string;
};

export type TaskOutputWriteResult =
  | { kind: 'file'; path: string }
  | { kind: 'directory'; path: string; files: string[] }
  | { kind: 'json'; path: string };

export async function writeTaskOutput(
  task: DeckTask,
  outPath: string,
  downloadResult: unknown
): Promise<TaskOutputWriteResult> {
  const files = collectOutputFiles(downloadResult);

  if (files.length === 0) {
    const target = await resolveSingleOutputPath(outPath, task.id, '.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      `${JSON.stringify(downloadResult ?? task.result ?? task, null, 2)}\n`
    );
    return { kind: 'json', path: path.resolve(target) };
  }

  if (files.length === 1) {
    const file = files[0]!;
    const target = await resolveSingleOutputPath(outPath, task.id, file.ext);
    const bytes = await downloadFile(file.url);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
    return { kind: 'file', path: path.resolve(target) };
  }

  const outIsExistingDirectory = await isDirectory(outPath);
  const downloaded = await Promise.all(
    files.map(async (file) => ({
      file,
      bytes: await downloadFile(file.url),
    }))
  );

  await fs.mkdir(outPath, { recursive: true });
  const written: string[] = [];
  for (let i = 0; i < downloaded.length; i += 1) {
    const item = downloaded[i];
    if (!item) continue;
    const target = path.join(
      outPath,
      orderedFileName(i, files.length, item.file.ext)
    );
    await fs.writeFile(target, item.bytes);
    written.push(path.resolve(target));
  }

  if (!outIsExistingDirectory && path.extname(outPath).toLowerCase() === '.zip') {
    return { kind: 'file', path: path.resolve(outPath) };
  }

  return { kind: 'directory', path: path.resolve(outPath), files: written };
}

function collectOutputFiles(value: unknown): OutputFile[] {
  const files: OutputFile[] = [];
  visitOutputValue(value, files);
  return files;
}

function visitOutputValue(value: unknown, files: OutputFile[]): void {
  if (isFileTuple(value)) {
    addOutputFile(value[0], files);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      visitOutputValue(item, files);
    }
    return;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.downloadUrl === 'string') {
      addOutputFile(record.downloadUrl, files);
    }
    for (const item of Object.values(record)) {
      visitOutputValue(item, files);
    }
  }
}

function addOutputFile(url: string, files: OutputFile[]): void {
  if (!/^https?:\/\//i.test(url)) {
    return;
  }
  files.push({ url, ext: extensionFromUrl(url) });
}

function isFileTuple(value: unknown): value is [string, ...unknown[]] {
  return Array.isArray(value) && typeof value[0] === 'string';
}

function extensionFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname);
    return ext ? ext.toLowerCase() : '.bin';
  } catch {
    return '.bin';
  }
}

async function resolveSingleOutputPath(
  outPath: string,
  taskId: string,
  expectedExt: string
): Promise<string> {
  const normalizedExpectedExt = expectedExt.startsWith('.')
    ? expectedExt.toLowerCase()
    : `.${expectedExt.toLowerCase()}`;
  const outExt = path.extname(outPath).toLowerCase();
  const outIsDirectory =
    (await isDirectory(outPath)) || !outExt || outExt !== normalizedExpectedExt;

  if (outIsDirectory) {
    return path.join(outPath, `${taskId}${normalizedExpectedExt}`);
  }
  return outPath;
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${url}: ${response.status} ${response.statusText}`
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

function orderedFileName(index: number, total: number, ext: string): string {
  const width = Math.max(2, String(total).length);
  const normalized = ext.startsWith('.') ? ext : `.${ext}`;
  return `${String(index + 1).padStart(width, '0')}${normalized}`;
}

export interface ConversionResultEnvelope {
  ok: true;
  input: string[];
  output: string;
  format: string;
  mode: string;
  slideCount?: number;
  stats?: ConversionStats;
  report?: string;
}

export function printSuccess(
  envelope: ConversionResultEnvelope,
  jsonOutput: boolean
): void {
  if (jsonOutput) {
    console.log(JSON.stringify(envelope));
    return;
  }
  console.log(envelope.output);
}

export function logVerbose(verbose: boolean, quiet: boolean, message: string): void {
  if (verbose && !quiet) {
    console.error(message);
  }
}

export function logProgress(quiet: boolean, message: string): void {
  if (!quiet) {
    console.error(message);
  }
}
