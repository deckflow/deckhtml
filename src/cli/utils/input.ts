import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';

export type ResolvedInput =
  | { kind: 'file'; paths: string[] }
  | { kind: 'url'; urls: string[] }
  | { kind: 'stdin'; tempPath: string };

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function writeTempHtml(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deckhtml-'));
  const filePath = path.join(dir, 'stdin.html');
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

async function downloadUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`
    );
  }
  const content = await response.text();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deckhtml-'));
  let baseName = 'page.html';
  try {
    const parsed = new URL(url);
    baseName = path.basename(parsed.pathname) || 'page.html';
    if (!baseName.toLowerCase().endsWith('.html') && !baseName.toLowerCase().endsWith('.htm')) {
      baseName = `${baseName}.html`;
    }
  } catch {
    baseName = `page-${randomBytes(4).toString('hex')}.html`;
  }
  const filePath = path.join(dir, baseName);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

export async function resolveInputs(inputs: string[]): Promise<ResolvedInput> {
  if (inputs.length === 0) {
    throw new Error(
      'Missing input. Provide an HTML file, URL, or "-" for stdin.'
    );
  }

  if (inputs.length === 1 && inputs[0] === '-') {
    if (process.stdin.isTTY) {
      throw new Error('No stdin data. Pipe HTML content or provide a file path.');
    }
    const html = await readStdin();
    if (!html.trim()) {
      throw new Error('Empty stdin input.');
    }
    const tempPath = await writeTempHtml(html);
    return { kind: 'stdin', tempPath };
  }

  const urls = inputs.filter(isUrl);
  const files = inputs.filter((item) => !isUrl(item));

  if (urls.length > 0 && files.length > 0) {
    throw new Error('Cannot mix URLs and local file paths in one invocation.');
  }

  if (urls.length > 0) {
    return { kind: 'url', urls };
  }

  const paths: string[] = [];
  for (const file of files) {
    try {
      await fs.access(file);
    } catch {
      throw new Error(`Input file not found: ${file}`);
    }
    paths.push(path.resolve(file));
  }

  return { kind: 'file', paths };
}

export async function materializeInputs(
  resolved: ResolvedInput
): Promise<{ paths: string[]; cleanup: () => Promise<void> }> {
  if (resolved.kind === 'file') {
    return { paths: resolved.paths, cleanup: async () => {} };
  }

  if (resolved.kind === 'stdin') {
    return {
      paths: [resolved.tempPath],
      cleanup: async () => {
        await fs.rm(path.dirname(resolved.tempPath), {
          recursive: true,
          force: true,
        });
      },
    };
  }

  const paths: string[] = [];
  const dirs: string[] = [];
  for (const url of resolved.urls) {
    const filePath = await downloadUrl(url);
    paths.push(filePath);
    dirs.push(path.dirname(filePath));
  }

  return {
    paths,
    cleanup: async () => {
      for (const dir of dirs) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
  };
}

export type OutputFormat = 'pptx' | 'pdf' | 'png';

const FORMAT_BY_EXT: Record<string, OutputFormat> = {
  '.pptx': 'pptx',
  '.pdf': 'pdf',
  '.png': 'png',
};

/**
 * Infer output format from `-o` extension.
 * Without `-o`, defaults to pptx (path is derived from the input).
 */
export function resolveOutputFormat(explicitOutput?: string): OutputFormat {
  if (!explicitOutput) {
    return 'pptx';
  }

  const ext = path.extname(explicitOutput).toLowerCase();
  if (!ext) {
    throw new Error(
      `Cannot infer format from output path "${explicitOutput}". Use a .pptx, .pdf, or .png extension.`
    );
  }

  const format = FORMAT_BY_EXT[ext];
  if (!format) {
    throw new Error(
      `Unsupported output extension "${ext}". Use .pptx, .pdf, or .png.`
    );
  }

  return format;
}

export function deriveOutputPath(
  inputPaths: string[],
  format: OutputFormat,
  explicitOutput?: string
): string {
  if (explicitOutput) {
    return path.resolve(explicitOutput);
  }

  if (inputPaths.length === 0) {
    throw new Error('--output is required when input path cannot be inferred.');
  }

  const ext = format === 'pptx' ? '.pptx' : format === 'pdf' ? '.pdf' : '.png';
  const first = inputPaths[0];

  if (format === 'png') {
    const base = path.basename(first, path.extname(first));
    return path.resolve(path.dirname(first), `${base || 'frames'}.png`);
  }

  if (inputPaths.length === 1) {
    const parsed = path.parse(first);
    return path.resolve(parsed.dir, `${parsed.name}${ext}`);
  }

  const parsed = path.parse(first);
  return path.resolve(parsed.dir, `deck${ext}`);
}
