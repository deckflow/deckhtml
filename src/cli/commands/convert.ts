import type { DeckTask } from '../types/sdk';
import { Command } from 'commander';
import { writeFileSync } from 'fs';
import path from 'path';
import { convertHtmlToPptx } from '../../api';
import { Context } from '../context';
import {
  deriveOutputPath,
  materializeInputs,
  resolveInputs,
} from '../utils/input';
import {
  logProgress,
  logVerbose,
  printSuccess,
  writeTaskOutput,
  type ConversionResultEnvelope,
} from '../utils/output';
import { resolveMode, validateCloudOnlyFlags } from '../utils/mode';
import { resolveViewport } from '../utils/size';

const DEFAULT_RENDER_WAIT = 3;
const DEFAULT_TIMEOUT = 600;

export interface ConvertOptions {
  output?: string;
  mode: string;
  format: string;
  width?: string;
  renderWait: string;
  rebuildSvg?: boolean;
  rebuildChart?: boolean;
  embedFonts?: boolean;
  mapMotion?: boolean;
  webhook?: string;
  retentionHours?: string;
  report?: boolean;
}

function parsePositiveInt(value: string, flag: string): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid ${flag}: ${value}`);
  }
  return n;
}

function buildCloudParams(
  ctx: Context,
  options: ConvertOptions,
  viewport?: { width: number; height: number }
): Record<string, unknown> {
  const retentionHours = options.retentionHours
    ? parsePositiveInt(options.retentionHours, '--retention-hours')
    : ctx.config.retentionHours;

  if (retentionHours < 0 || retentionHours > 99) {
    throw new Error('--retention-hours must be between 0 and 99');
  }

  const params: Record<string, unknown> = {
    needEmbedFonts: Boolean(options.embedFonts),
    renderWait: parsePositiveInt(options.renderWait, '--render-wait'),
    rebuildSvg: Boolean(options.rebuildSvg),
    rebuildChart: Boolean(options.rebuildChart),
    mapMotion: Boolean(options.mapMotion),
    webhook: options.webhook ?? ctx.config.get('webhook'),
    retentionHours,
  };

  if (viewport) {
    params.width = viewport.width;
    params.height = viewport.height;
  }

  return params;
}

async function runLocalConvert(
  ctx: Context,
  inputPaths: string[],
  outputPath: string,
  viewport: { width: number; height: number },
  format: string
): Promise<ConversionResultEnvelope> {
  if (format !== 'pptx') {
    throw new Error(
      `Format "${format}" is not supported in local mode. Use --mode cloud.`
    );
  }

  if (inputPaths.length > 1) {
    logVerbose(
      ctx.verbose,
      ctx.quiet,
      `Merging ${inputPaths.length} HTML files into one PPTX`
    );
  } else {
    logVerbose(ctx.verbose, ctx.quiet, `Rendering ${inputPaths[0]}`);
  }
  logVerbose(
    ctx.verbose,
    ctx.quiet,
    `Viewport: ${viewport.width}x${viewport.height}`
  );

  const result = await convertHtmlToPptx({
    inputs: inputPaths,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    allowLocalResources: true,
    quiet: ctx.quiet,
  });

  writeFileSync(outputPath, result.data);
  logVerbose(ctx.verbose, ctx.quiet, `Writing ${outputPath}`);

  return {
    ok: true,
    input: inputPaths,
    output: outputPath,
    format,
    mode: 'local',
    slideCount: result.slideCount,
  };
}

async function runCloudConvert(
  ctx: Context,
  inputPaths: string[],
  outputPath: string,
  options: ConvertOptions,
  viewport: { width: number; height: number } | undefined,
  format: string
): Promise<ConversionResultEnvelope> {
  if (format === 'pdf') {
    throw new Error('PDF output is not yet supported.');
  }

  const deck = await ctx.getDeck();
  const spaceId = ctx.config.get('spaceId');
  if (!spaceId) {
    throw new Error(
      'Space ID is missing. Run `deckhtml auth login` first or ensure your API key includes workspace context.'
    );
  }

  const params = buildCloudParams(ctx, options, viewport);
  const taskName = path.basename(inputPaths[0]!, path.extname(inputPaths[0]!));

  logProgress(ctx.quiet, `Uploading ${inputPaths.length} file(s)...`);

  let task;
  if (format === 'png') {
    task = await deck.convertHtmlToPng({
      spaceId,
      files: inputPaths,
      name: taskName,
      params: params as never,
      upload: {
        onProgress: (p: number) =>
          logProgress(ctx.quiet, `Uploading: ${(p * 100).toFixed(1)}%`),
      },
    });
  } else {
    task = await deck.convertHtmlToPptx({
      spaceId,
      files: inputPaths,
      name: taskName,
      params: params as never,
      upload: {
        onProgress: (p: number) =>
          logProgress(ctx.quiet, `Uploading: ${(p * 100).toFixed(1)}%`),
      },
    });
  }

  logProgress(ctx.quiet, `Task created: ${task.id}`);
  logProgress(ctx.quiet, 'Converting...');

  const completed = await deck.tasks.wait(task.id, {
    timeout: DEFAULT_TIMEOUT,
    useEventStream: true,
    onProgress: (next: DeckTask) => {
      if (next.status === 'running') {
        logProgress(ctx.quiet, `Status: ${next.status}`);
      }
    },
  });

  if (completed.status !== 'completed') {
    throw new Error(completed.error ?? `Conversion failed (${completed.status})`);
  }

  const download = await deck.tasks.down(task.id);
  const writeResult = await writeTaskOutput(completed, outputPath, download);

  const finalOutput =
    writeResult.kind === 'file' || writeResult.kind === 'json'
      ? writeResult.path
      : writeResult.path;

  return {
    ok: true,
    input: inputPaths,
    output: finalOutput,
    format,
    mode: 'cloud',
  };
}

export function registerConvertCommand(program: Command, ctx: Context): void {
  program
    .argument('[inputs...]', 'HTML file(s), URL, or "-" for stdin')
    .option('-o, --output <path>', 'Output path')
    .option('--mode <mode>', 'Execution mode: auto, local, or cloud', 'auto')
    .option('--format <format>', 'Output format: pptx, pdf, or png', 'pptx')
    .option(
      '--width <pixels>',
      'Playwright viewport width (height scales at 16:9)'
    )
    .option(
      '--render-wait <seconds>',
      'Per-page wait before capture (cloud)',
      String(DEFAULT_RENDER_WAIT)
    )
    .option('--rebuild-svg', 'Rebuild SVG objects (cloud only)', false)
    .option('--rebuild-chart', 'Rebuild chart objects (cloud only)', false)
    .option('--embed-fonts', 'Embed fonts (cloud only)', false)
    .option('--map-motion', 'Map animations (cloud only)', false)
    .option('--webhook <url>', 'Callback URL (cloud)')
    .option('--retention-hours <n>', 'Cloud file retention hours (0-99)')
    .option('--report', 'Generate conversion report next to output', false)
    .action(async (inputs: string[], options: ConvertOptions) => {
      if (inputs.length === 0) {
        return;
      }

      try {
        const format = options.format.toLowerCase();
        if (!['pptx', 'pdf', 'png'].includes(format)) {
          throw new Error(
            `Invalid --format: ${options.format}. Use pptx, pdf, or png.`
          );
        }

        const modeInput = options.mode.toLowerCase();
        if (!['auto', 'local', 'cloud'].includes(modeInput)) {
          throw new Error(
            `Invalid --mode: ${options.mode}. Use auto, local, or cloud.`
          );
        }

        const resolved = await resolveInputs(inputs);
        const { paths, cleanup } = await materializeInputs(resolved);

        try {
          if (resolved.kind === 'stdin' && !options.output) {
            throw new Error(
              '--output is required when reading HTML from stdin.'
            );
          }

          const mode = resolveMode(
            modeInput as 'auto' | 'local' | 'cloud',
            ctx.hasCredentials()
          );

          validateCloudOnlyFlags(mode, {
            rebuildSvg: options.rebuildSvg,
            rebuildChart: options.rebuildChart,
            embedFonts: options.embedFonts,
            mapMotion: options.mapMotion,
          });

          const outputPath = deriveOutputPath(
            paths,
            format as 'pptx' | 'pdf' | 'png',
            options.output
          );

          const localViewport = resolveViewport(options.width, true)!;
          const cloudViewport = resolveViewport(options.width, false);

          let envelope: ConversionResultEnvelope;
          if (mode === 'cloud') {
            envelope = await runCloudConvert(
              ctx,
              paths,
              outputPath,
              options,
              cloudViewport,
              format
            );
          } else {
            envelope = await runLocalConvert(
              ctx,
              paths,
              outputPath,
              localViewport,
              format
            );
          }

          if (options.report) {
            const reportPath = `${outputPath}.report.json`;
            writeFileSync(reportPath, `${JSON.stringify(envelope, null, 2)}\n`);
            envelope.report = reportPath;
          }

          printSuccess(envelope, ctx.jsonOutput);
          process.exit(0);
        } finally {
          await cleanup();
        }
      } catch (error) {
        ctx.error(error);
      }
    });
}
