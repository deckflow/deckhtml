import type { DeckTask } from '../types/sdk';
import { Command } from 'commander';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { convertHtmlToPptx, inspectHtmlFonts } from '../../api';
import { convertHtmlToPng } from '../../png-export';
import {
  detectCurrentPlatformTarget,
  type PlatformTarget,
} from '../../utils/platformFontMap';
import { buildPngOutputPaths } from '../../utils/png-output-path';
import { Context } from '../context';
import {
  deriveOutputPath,
  materializeInputs,
  resolveInputs,
  resolveOutputFormat,
} from '../utils/input';
import {
  attachSimplifiedToEnvelope,
  logProgress,
  logVerbose,
  printFontEmbedNotice,
  printSimplifiedNotice,
  printSuccess,
  writeTaskOutput,
  type ConversionResultEnvelope,
} from '../utils/output';
import {
  buildConversionReport,
  EMPTY_CONVERSION_STATS,
} from '../../conversion-report';
import { resolveMode, validateCloudOnlyFlags } from '../utils/mode';
import { resolveViewport } from '../utils/size';

const DEFAULT_TIMEOUT = 600;

const VALID_PLATFORMS = ['win', 'mac', 'ios', 'android', 'linux'] as const;
type CloudPlatform = 'mac' | 'win';

export interface ConvertOptions {
  output?: string;
  mode: string;
  width?: string;
  platform?: string;
  embedFonts?: boolean;
  report?: boolean;
}

function resolvePlatformOption(platform?: string): PlatformTarget {
  if (!platform) return detectCurrentPlatformTarget();

  if (!VALID_PLATFORMS.includes(platform as (typeof VALID_PLATFORMS)[number])) {
    throw new Error(
      `Invalid --platform: ${platform}. Use win, mac, ios, android, or linux.`
    );
  }

  return platform as PlatformTarget;
}

function toCloudPlatform(platform: PlatformTarget): CloudPlatform {
  return platform === 'mac' || platform === 'ios' ? 'mac' : 'win';
}

function buildCloudParams(
  options: ConvertOptions,
  platform: CloudPlatform,
  viewport?: { width: number; height: number }
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    needEmbedFonts: Boolean(options.embedFonts),
    platform,
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
  format: string,
  platform: PlatformTarget
): Promise<ConversionResultEnvelope> {
  if (format === 'png') {
    logVerbose(
      ctx.verbose,
      ctx.quiet,
      `Rendering PNG from ${inputPaths.length} file(s)`
    );
    logVerbose(
      ctx.verbose,
      ctx.quiet,
      `Viewport: ${viewport.width}x${viewport.height}`
    );

    const result = await convertHtmlToPng({
      inputs: inputPaths,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      allowLocalResources: true,
      quiet: ctx.quiet,
    });

    const outputPaths = buildPngOutputPaths(outputPath, result.images.length);
    for (let i = 0; i < result.images.length; i++) {
      const target = outputPaths[i]!;
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, result.images[i]!);
      logVerbose(ctx.verbose, ctx.quiet, `Writing ${target}`);
    }

    return {
      ok: true,
      input: inputPaths,
      output: outputPaths[0]!,
      outputs: outputPaths,
      format,
      mode: 'local',
      slideCount: result.slideCount,
      stats: result.stats,
    };
  }

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
  logVerbose(
    ctx.verbose,
    ctx.quiet,
    `Font mapping: platform=${platform} (script auto-detected from text)`
  );

  const result = await convertHtmlToPptx({
    inputs: inputPaths,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    allowLocalResources: true,
    quiet: ctx.quiet,
    platform,
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
    stats: result.stats,
  };
}

async function runCloudConvert(
  ctx: Context,
  inputPaths: string[],
  outputPath: string,
  options: ConvertOptions,
  platform: PlatformTarget,
  viewport: { width: number; height: number } | undefined,
  format: string
): Promise<ConversionResultEnvelope> {
  if (format === 'pdf') {
    throw new Error('PDF output is not yet supported.');
  }

  const deck = await ctx.getDeck();
  const spaceId = ctx.config.get('spaceId');

  const params = buildCloudParams(options, toCloudPlatform(platform), viewport);
  const taskName = path.basename(inputPaths[0]!, path.extname(inputPaths[0]!));

  logVerbose(ctx.verbose, ctx.quiet, `API base: ${ctx.config.apiBase}`);
  logVerbose(
    ctx.verbose,
    ctx.quiet,
    spaceId ? `Space ID: ${spaceId}` : 'Space ID: auto (GET /user/self)'
  );
  logProgress(ctx.quiet, `Uploading ${inputPaths.length} file(s)...`);

  const taskInput = {
    ...(spaceId ? { spaceId } : {}),
    files: inputPaths,
    name: taskName,
    params: params as never,
    upload: {
      onProgress: (p: number) =>
        logProgress(ctx.quiet, `Uploading: ${(p * 100).toFixed(1)}%`),
    },
  };

  const task =
    format === 'png'
      ? await deck.convertHtmlToPng(taskInput)
      : await deck.convertHtmlToPptx(taskInput);

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

  // Font / simplified stats are PPTX-oriented (embed tips, rasterized elements).
  // PNG skips probing so local and cloud stay quiet and consistent.
  if (format !== 'pptx') {
    return {
      ok: true,
      input: inputPaths,
      output: finalOutput,
      format,
      mode: 'cloud',
    };
  }

  logProgress(ctx.quiet, 'Probing fonts used in HTML...');
  const inspect = await inspectHtmlFonts({
    inputs: inputPaths,
    viewportWidth: viewport?.width,
    viewportHeight: viewport?.height,
    allowLocalResources: true,
    quiet: true,
    platform,
  });

  return {
    ok: true,
    input: inputPaths,
    output: finalOutput,
    format,
    mode: 'cloud',
    slideCount: inspect.slideCount,
    stats: inspect.stats,
  };
}

export function registerConvertCommand(program: Command, ctx: Context): void {
  program
    .argument('[inputs...]', 'HTML file(s), URL, or "-" for stdin')
    .option(
      '-o, --output <path>',
      'Output path (.pptx / .png; format inferred from extension)'
    )
    .option('--mode <mode>', 'Execution mode: auto, local, or cloud', 'auto')
    .option(
      '--width <pixels>',
      'Playwright viewport width (height scales at 16:9)'
    )
    .option(
      '--platform <platform>',
      'Target platform: local supports win, mac, ios, android, linux; cloud uses mac or win (ios→mac, others→win)'
    )
    .option('--embed-fonts', 'Embed fonts (cloud only)', false)
    .option('--report', 'Generate conversion report next to output', false)
    .action(async (inputs: string[], options: ConvertOptions) => {
      if (inputs.length === 0) {
        return;
      }

      try {
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

          const format = resolveOutputFormat(options.output);

          const mode = resolveMode(
            modeInput as 'auto' | 'local' | 'cloud',
            ctx.hasCredentials()
          );

          validateCloudOnlyFlags(mode, {
            embedFonts: options.embedFonts,
          });

          const platform = resolvePlatformOption(options.platform);

          const outputPath = deriveOutputPath(paths, format, options.output);

          const localViewport = resolveViewport(options.width, true)!;
          const cloudViewport = resolveViewport(options.width, false);

          const startedAt = Date.now();
          let envelope: ConversionResultEnvelope;
          if (mode === 'cloud') {
            envelope = await runCloudConvert(
              ctx,
              paths,
              outputPath,
              options,
              platform,
              cloudViewport,
              format
            );
          } else {
            envelope = await runLocalConvert(
              ctx,
              paths,
              outputPath,
              localViewport,
              format,
              platform
            );
          }

          if (options.report) {
            const reportPath = `${outputPath}.report.json`;
            const report = buildConversionReport({
              input: paths,
              output: outputPath,
              format,
              mode: envelope.mode,
              slideCount: envelope.slideCount ?? 0,
              stats: envelope.stats ?? EMPTY_CONVERSION_STATS,
              platform,
              ...(mode === 'local'
                ? { viewport: localViewport }
                : cloudViewport
                  ? { viewport: cloudViewport }
                  : {}),
              durationMs: Date.now() - startedAt,
            });
            writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
            envelope.report = reportPath;
          }

          envelope = attachSimplifiedToEnvelope(envelope);
          if (format === 'pptx') {
            printSimplifiedNotice(
              envelope.simplified,
              envelope.mode,
              ctx.quiet,
              ctx.jsonOutput
            );
            printFontEmbedNotice(
              envelope.stats?.fonts,
              envelope.mode,
              Boolean(options.embedFonts),
              ctx.quiet,
              ctx.jsonOutput
            );
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
