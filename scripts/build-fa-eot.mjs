// One-time script: generate PowerPoint-compatible EOTs from Font Awesome TTFs.
// Uses html2pptx's sanitize + sfnttool pipeline. Output is committed to deckhtml.
// Run from deckhtml root: node scripts/build-fa-eot.mjs
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DECKHTML_ROOT = path.resolve(__dirname, '..');
const HTML2PPTX_ROOT = path.resolve(DECKHTML_ROOT, '../html2pptx');
const FONTS_ROOT = path.resolve(DECKHTML_ROOT, '../../fonts/fonts/font-awesome');
const OUT_ROOT = path.resolve(DECKHTML_ROOT, 'assets/fonts/font-awesome');

const SANITIZE_SCRIPT = path.join(HTML2PPTX_ROOT, 'tools/sanitize-ttf-for-eot.py');
const SFNTTOOL_JAR = path.join(HTML2PPTX_ROOT, 'tools/sfnttool.jar');

const TARGETS = [
  { ver: '6', src: 'fa-solid-900.ttf', out: 'fa-solid-900.eot' },
  { ver: '6', src: 'fa-regular-400.ttf', out: 'fa-regular-400.eot' },
  { ver: '6', src: 'fa-brands-400.ttf', out: 'fa-brands-400.eot' },
  { ver: '6', src: 'fa-v4compatibility.ttf', out: 'fa-v4compatibility.eot' },
  { ver: '5', src: 'fa-solid-900.ttf', out: 'fa-solid-900.eot' },
  { ver: '5', src: 'fa-regular-400.ttf', out: 'fa-regular-400.eot' },
  { ver: '5', src: 'fa-brands-400.ttf', out: 'fa-brands-400.eot' },
];

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', timeout: 300_000, ...opts });
}

function buildOne({ ver, src, out }) {
  const ttfIn = path.join(FONTS_ROOT, ver, src);
  if (!existsSync(ttfIn)) {
    console.warn(`skip (missing source TTF): ${ttfIn}`);
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-eot-'));
  try {
    const sanitizedTtf = path.join(tmp, 'sanitized.ttf');
    const eotOut = path.join(tmp, out);
    run('python3', [SANITIZE_SCRIPT, ttfIn, sanitizedTtf]);
    run('java', ['-jar', SFNTTOOL_JAR, '-e', '-x', '-h', sanitizedTtf, eotOut]);
    const outDir = path.join(OUT_ROOT, ver);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, out), readFileSync(eotOut));
    console.log(`✓ ${ver}/${out} (${readFileSync(eotOut).length} bytes)`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

import fs from 'fs';
for (const t of TARGETS) buildOne(t);
console.log('Done.');
