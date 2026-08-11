#!/usr/bin/env node

import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sampleDir = path.join(repoRoot, 'sample');
const inputDir = path.join(sampleDir, 'inputs');
const outputDir = path.join(sampleDir, 'outputs');
const reportDir = path.join(sampleDir, 'reports');
const cliPath = path.join(repoRoot, 'dist', 'cli.js');

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    child.once('error', (error) => resolve({ code: 1, error }));
    child.once('close', (code) => resolve({ code: code ?? 1 }));
  });
}

async function resetOutputDirectories() {
  for (const directory of [outputDir, reportDir]) {
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
  }
}

async function main() {
  await resetOutputDirectories();

  const entries = await readdir(inputDir, { withFileTypes: true });
  const conversions = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(inputDir, entry.name);
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.html') {
      conversions.push({
        name: entry.name,
        inputs: [entryPath],
        baseName: path.basename(entry.name, path.extname(entry.name)),
      });
      continue;
    }

    if (entry.isDirectory()) {
      const htmlFiles = (await readdir(entryPath, { withFileTypes: true }))
        .filter((child) => child.isFile() && path.extname(child.name).toLowerCase() === '.html')
        .map((child) => path.join(entryPath, child.name))
        .sort((a, b) => a.localeCompare(b));

      if (htmlFiles.length > 0) {
        conversions.push({ name: entry.name, inputs: htmlFiles, baseName: entry.name });
      } else {
        console.warn(`Skipping ${path.relative(repoRoot, entryPath)}: no HTML files found.`);
      }
    }
  }

  if (conversions.length === 0) {
    console.log(`No HTML files or HTML-containing directories found in ${path.relative(repoRoot, inputDir)}.`);
    return;
  }

  let failures = 0;
  for (const conversion of conversions) {
    const outputPath = path.join(outputDir, `${conversion.baseName}.pptx`);
    const generatedReportPath = `${outputPath}.report.json`;
    const reportPath = path.join(reportDir, `${conversion.baseName}.json`);
    const inputLabel = conversion.inputs.map((input) => path.relative(repoRoot, input)).join(', ');

    console.log(`\nConverting ${inputLabel}...`);
    const result = await runCli([
      ...conversion.inputs,
      '--output', outputPath,
      '--mode', 'local',
      '--report',
      '--force',
      '--json',
    ]);

    if (result.code !== 0) {
      failures += 1;
      console.error(`Failed: ${conversion.name}${result.error ? ` (${result.error.message})` : ''}`);
      continue;
    }

    try {
      await stat(generatedReportPath);
      await rm(reportPath, { force: true });
      await rename(generatedReportPath, reportPath);
      console.log(`Wrote ${path.relative(repoRoot, outputPath)} and ${path.relative(repoRoot, reportPath)}.`);
    } catch (error) {
      failures += 1;
      console.error(`Conversion succeeded but report handling failed for ${conversion.name}: ${error.message}`);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    console.error(`\n${failures} conversion(s) failed.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
