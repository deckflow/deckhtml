import type { DeckTask } from '../types/sdk';
import { Command } from 'commander';
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
import { atomicWriteFile } from '../utils/write';
import {
  DEFAULT_VIEWPORT_HEIGHT,
  DEFAULT_VIEWPORT_WIDTH,
  detectViewportFromFile,
} from '../../utils/viewport';

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
  executablePath?: string;
  exclude?: string;
  identityAttribute?: string;
  force?: boolean;
  /** commander --no-animations sets this to false (default true). */
  animations?: boolean;
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
  viewport: { width: number; height: number } | undefined,
  format: string,
  platform: PlatformTarget,
  executablePath?: string,
  force?: boolean,
  excludeSelector?: string,
  identityAttribute?: string,
  animations?: boolean
): Promise<ConversionResultEnvelope> {
  const resolvedViewport =
    viewport ??
    detectViewportFromFile(inputPaths[0]!) ?? {
      width: DEFAULT_VIEWPORT_WIDTH,
      height: DEFAULT_VIEWPORT_HEIGHT,
    };
  const viewportOpts = viewport
    ? {
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      }
    : {};

  if (format === 'png') {
    logVerbose(
      ctx.verbose,
      ctx.quiet,
      `Rendering PNG from ${inputPaths.length} file(s)`
    );
    logVerbose(
      ctx.verbose,
      ctx.quiet,
      `Viewport: ${resolvedViewport.width}x${resolvedViewport.height}${
        viewport ? '' : ' (auto)'
      }`
    );

    const result = await convertHtmlToPng({
      inputs: inputPaths,
      ...viewportOpts,
      allowLocalResources: true,
      quiet: ctx.quiet,
      excludeSelector,
      identityAttribute,
      browser: executablePath ? { executablePath } : undefined,
    });

    const outputPaths = buildPngOutputPaths(outputPath, result.images.length);
    for (let i = 0; i < result.images.length; i++) {
      const target = outputPaths[i]!;
      await atomicWriteFile(target, result.images[i]!, { overwrite: force });
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
    `Viewport: ${resolvedViewport.width}x${resolvedViewport.height}${
      viewport ? '' : ' (auto)'
    }`
  );
  logVerbose(
    ctx.verbose,
    ctx.quiet,
    `Font mapping: platform=${platform} (script auto-detected from text)`
  );

  const result = await convertHtmlToPptx({
    inputs: inputPaths,
    ...viewportOpts,
    allowLocalResources: true,
    quiet: ctx.quiet,
    platform,
    excludeSelector,
    identityAttribute,
    animations,
    browser: executablePath ? { executablePath } : undefined,
  });

  await atomicWriteFile(outputPath, result.data, { overwrite: force });
  logVerbose(ctx.verbose, ctx.quiet, `Writing ${outputPath}`);

  return {
    ok: true,
    input: inputPaths,
    output: outputPath,
    format,
    mode: 'local',
    slideCount: result.slideCount,
    stats: result.stats,
    conversionReport: result.report,
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
  if (!ctx.hasCredentials()) {
    logProgress(
      ctx.quiet,
      'Guest mode (X-Auth-UUID only): cloud usage is rate-limited. Run `deckhtml auth login` or `deckhtml config set api-key <key>` for full access.'
    );
  }
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

  // Guest mode (no token/api-key): the backend parks the task in pending and
  // waits for an explicit start. If create triggered 401 → login → retry,
  // credentials are now set and authenticated tasks auto-start.
  if (!ctx.hasCredentials()) {
    logProgress(ctx.quiet, 'Starting guest task...');
    await deck.tasks.start(task.id);
  }

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
      'Playwright viewport width (height scales at 16:9). When omitted, auto-detect from HTML deck-size / viewport meta / CSS size vars / slide hosts, else 1280'
    )
    .option(
      '--platform <platform>',
      'Target platform: local supports win, mac, ios, android, linux; cloud uses mac or win (ios→mac, others→win)'
    )
    .option('--embed-fonts', 'Embed fonts (cloud only)', false)
    .option('--report', 'Generate conversion report next to output', false)
    .option(
      '--executable-path <path>',
      'Chromium executable to use for local conversion (overrides DECKHTML_CHROMIUM_EXECUTABLE_PATH)'
    )
    .option(
      '--exclude <selector>',
      'CSS selector matching runtime/navigation elements to exclude from conversion'
    )
    .option(
      '--identity-attribute <name>',
      'Attribute carrying a stable element identity (default: data-element-id)'
    )
    .option(
      '--force',
      'Overwrite an existing output file instead of refusing (default: refuse)',
      false
    )
    .option(
      '--no-animations',
      'Disable entrance-animation export (data-animation*, CSS @keyframes/transitions, anime.js interception)'
    )
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

          // Omit viewport when --width is unset so API auto-detects from HTML/SVG.
          const explicitViewport = resolveViewport(options.width, false);
          const localViewport = explicitViewport;
          const cloudViewport =
            explicitViewport ??
            detectViewportFromFile(paths[0]!) ??
            undefined;

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
              platform,
              options.executablePath,
              options.force,
              options.exclude,
              options.identityAttribute,
              options.animations
            );
          }

          if (options.report) {
            const reportPath = `${outputPath}.report.json`;
            const reportViewport =
              (mode === 'local' ? localViewport : cloudViewport) ??
              detectViewportFromFile(paths[0]!) ?? {
                width: DEFAULT_VIEWPORT_WIDTH,
                height: DEFAULT_VIEWPORT_HEIGHT,
              };
            // Prefer the new structured per-element report (DH-P0-002) when available
            // (local mode); fall back to the aggregate stats report for cloud mode.
            const report =
              envelope.conversionReport ??
              buildConversionReport({
                input: paths,
                output: outputPath,
                format,
                mode: envelope.mode,
                slideCount: envelope.slideCount ?? 0,
                stats: envelope.stats ?? EMPTY_CONVERSION_STATS,
                platform,
                viewport: reportViewport,
                durationMs: Date.now() - startedAt,
              });
            await atomicWriteFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
              overwrite: options.force,
            });
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
