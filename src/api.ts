/**
 * API Module
 * Main conversion function for programmatic use
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ConversionOptions,
  ConversionResult,
  ElementInfo,
  UsedFontDescriptor,
} from './types';
import { HTMLLoader } from './loader';
import { ElementInspector } from './inspector';
import { inspectSlidesParallel } from './multi-slide-inspect';
import { PPTXGenerator } from './generator';
import { setViewportPixels } from './utils/coordinate';
import { resolveSlideInspectConcurrency, runAsyncPool } from './utils/async-pool';
import { isChineseFont } from './utils/chineseFonts';
import {
  isBold,
  isItalic,
  normalizeFontAwesomeFreeFamily,
  normalizeFontAwesomeFamily,
  parseScriptFontFaces,
} from './utils/style';
import {
  detectContainerScriptHints,
  splitTextByScript,
} from './utils/textScript';
import { buildPlatformFontContext, PlatformFontContext } from './utils/platformFontMap';
import { runQuietly } from './utils/quiet';
import { embedFontAwesomeFonts } from './utils/fa-font-embedder';
import { buildElementStats, buildFontStats, buildSimplifiedStats, recomputeSummary } from './conversion-report';
import { DiagnosticsCollector, ConversionError, RULE_IDS, type Diagnostic } from './utils/diagnostics';

const ENGINE_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/**
 * Read SVG viewBox / width+height for viewport auto-sizing.
 */
function parseSvgViewport(inputPath: string): { width: number; height: number } | null {
  try {
    const content = readFileSync(inputPath, 'utf8');
    const viewBoxMatch = content.match(/\bviewBox=["']([^"']+)["']/i);
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
      if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
        return { width: Math.round(parts[2]), height: Math.round(parts[3]) };
      }
    }
    const wMatch = content.match(/\bwidth=["']([\d.]+)/i);
    const hMatch = content.match(/\bheight=["']([\d.]+)/i);
    const w = wMatch ? parseFloat(wMatch[1]) : 0;
    const h = hMatch ? parseFloat(hMatch[1]) : 0;
    if (w > 0 && h > 0) return { width: Math.round(w), height: Math.round(h) };
  } catch {
    /* ignore read/parse errors */
  }
  return null;
}

function resolveInputPaths(options: ConversionOptions): string[] {
  if (options.inputs?.length) return options.inputs;
  if (options.input) return [options.input];
  throw new Error('At least one input file is required (use input or inputs).');
}

function resolveViewportForInput(
  inputPath: string,
  options: ConversionOptions
): { width: number; height: number } {
  const inputIsSvg = inputPath.toLowerCase().endsWith('.svg');
  let viewportWidth = options.viewportWidth;
  let viewportHeight = options.viewportHeight;
  if (inputIsSvg && viewportWidth === undefined && viewportHeight === undefined) {
    const svgViewport = parseSvgViewport(inputPath);
    if (svgViewport) {
      viewportWidth = svgViewport.width;
      viewportHeight = svgViewport.height;
    }
  }
  return {
    width: viewportWidth ?? 1280,
    height: viewportHeight ?? 720,
  };
}

function collectFontsFromElements(
  elements: ElementInfo[],
  platformFontContext: PlatformFontContext | undefined,
  usedFontsMap: Map<string, UsedFontDescriptor>
): void {
  const documentUsesChineseFont = !platformFontContext && elements.some(
    (el) =>
      isChineseFont(el.styles?.fontFamily ?? '') ||
      el.richText?.some((run) => isChineseFont(run.styles?.fontFamily ?? ''))
  );

  const registerFont = (fontFamily: string, styles: ElementInfo['styles'], boldOverride?: boolean) => {
    if (!fontFamily) return;
    const bold = boldOverride ?? isBold(styles.fontWeight);
    const italic = isItalic(styles.fontStyle);
    const key = `${fontFamily}|${bold}|${italic}`;
    if (usedFontsMap.has(key)) return;
    usedFontsMap.set(key, { fontFamily, bold, italic });
  };

  const collectTextScripts = (text: string, containerText: string) => {
    const hints = detectContainerScriptHints(containerText || text);
    return splitTextByScript(text, hints).map((seg) => seg.script);
  };

  const getElementText = (el: ElementInfo): string => {
    if (el.richText?.length) return el.richText.map((run) => run.text).join('');
    return el.content ?? '';
  };

  const addFont = (styles: ElementInfo['styles'], texts: string[], containerText: string) => {
    if (!styles?.fontFamily) return;
    const faFreeFace = normalizeFontAwesomeFreeFamily(
      styles.fontFamily,
      styles.fontWeight?.toString()
    );
    if (faFreeFace) {
      registerFont(faFreeFace, styles, false);
      return;
    }
    const faFace = normalizeFontAwesomeFamily(styles.fontFamily, styles.fontWeight?.toString());
    if (faFace) {
      registerFont(faFace, styles, false);
      return;
    }

    const scripts = new Set(
      texts.flatMap((text) => collectTextScripts(text, containerText))
    );
    if (scripts.size === 0) scripts.add('latin');

    const stackHasChinese = isChineseFont(styles.fontFamily);
    if (!platformFontContext && !stackHasChinese && documentUsesChineseFont) return;

    for (const textScript of scripts) {
      const faces = parseScriptFontFaces(styles.fontFamily, {
        platformFontContext,
        specifiedFontFamily: styles.fontFamilySpecified,
        textScript,
      });
      registerFont(faces.latin, styles);
      if (faces.ea !== faces.latin) {
        registerFont(faces.ea, styles);
      }
      if (faces.cs && faces.cs !== faces.latin && faces.cs !== faces.ea) {
        registerFont(faces.cs, styles);
      }
    }
  };

  elements.forEach((el) => {
    const containerText = getElementText(el);
    addFont(el.styles, [containerText], containerText);
    el.richText?.forEach((run) => addFont(run.styles, [run.text], containerText));

    el.tableData?.rows.forEach((row) => {
      row.cells.forEach((cell) => {
        addFont(cell.styles ?? el.styles, [cell.text], cell.text);
      });
    });
  });
}

interface ProcessSingleInputResult {
  slidesMap: Map<number, ElementInfo[]>;
  slideCoordsNormalized: boolean;
  excludedCount: number;
}

interface ProcessSingleInputRuntime {
  /** Cap in-file slide parallelism when multiple HTML files run concurrently. */
  slideInspectConcurrency?: number;
}

async function processSingleInput(
  loader: HTMLLoader,
  inputPath: string,
  options: ConversionOptions,
  platformFontContext: PlatformFontContext | undefined,
  usedFontsMap: Map<string, UsedFontDescriptor>,
  runtime?: ProcessSingleInputRuntime,
  diagnostics?: import('./utils/resource-policy').ResourceDiagnostic[],
  identityDiagnostics?: import('./utils/diagnostics').Diagnostic[]
): Promise<ProcessSingleInputResult> {
  const inputIsSvg = inputPath.toLowerCase().endsWith('.svg');
  const viewport = resolveViewportForInput(inputPath, options);
  setViewportPixels(viewport.width, viewport.height);

  const page = await loader.loadHTML(
    inputPath,
    viewport,
    {
      allowLocalResources: options.allowLocalResources,
      resourcePolicy: options.resourcePolicy,
      diagnostics,
    }
  );

  try {
    if (inputIsSvg) {
      const svgValidation = await page.evaluate(() => {
        const parserError = document.querySelector('parsererror');
        if (parserError) {
          const text = parserError.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          return { ok: false as const, reason: text || 'SVG XML parse error' };
        }
        const svgRoot =
          document.documentElement instanceof SVGSVGElement
            ? document.documentElement
            : document.querySelector('svg');
        if (!svgRoot) {
          return { ok: false as const, reason: 'No SVG root element found in document' };
        }
        return { ok: true as const };
      });
      if (!svgValidation.ok) {
        throw new Error(
          `Cannot convert invalid SVG: ${svgValidation.reason}\n` +
            'Fix XML syntax errors in the SVG file and try again.'
        );
      }
    }

    const inspector = new ElementInspector(page);
    const autoDetect = options.autoDetectSlides !== false;
    const discovered = await inspector.discoverSlideContainers(
      options.slideSelector,
      autoDetect
    );

    let slidesMap: Map<number, ElementInfo[]>;
    let slideCoordsNormalized = false;
    const excludedCounter = { value: 0 };

    if (discovered.count >= 2) {
      if (options.splitByHeight) {
        console.warn(
          '⚠️  splitByHeight is ignored when multiple slide containers are detected.'
        );
      }
      const ruleHint = discovered.rule ?? discovered.selector;
      console.log(`📑 Multi-slide mode: ${discovered.count} pages (rule: ${ruleHint})`);
      if (discovered.activeDeck) {
        console.log(
          `🎴 Active-gated deck detected (class: .${discovered.activeDeck.activeClass}, ${discovered.count} slides)`
        );
      }

      const inspectOptions = {
        inputIsSvg,
        excludeSelector: options.excludeSelector,
        slideIdAttribute: options.slideIdAttribute,
        identityAttribute: options.identityAttribute,
        identityDiagnostics,
        excludedCount: excludedCounter,
      };
      const slideConcurrency =
        runtime?.slideInspectConcurrency ?? resolveSlideInspectConcurrency();
      if (slideConcurrency > 1 && discovered.count > 1) {
        console.log(
          `⚡ Parallel inspect: ${slideConcurrency} Playwright pages (CPU cores − 2)`
        );
        await loader.close().catch(() => {});
        slidesMap = await inspectSlidesParallel(loader, {
          inputPath,
          viewport,
          allowLocalResources: options.allowLocalResources,
          resourcePolicy: options.resourcePolicy,
          diagnostics,
          slideSelector: options.slideSelector,
          autoDetectSlides: autoDetect,
          discovery: discovered,
          inspectOptions,
          concurrency: slideConcurrency,
        });
      } else {
        slidesMap = await inspector.inspectSlidesIsolated(discovered, inspectOptions);
      }
      slideCoordsNormalized = true;
      for (const elements of slidesMap.values()) {
        collectFontsFromElements(elements, platformFontContext, usedFontsMap);
      }
    } else {
      const elements = await inspector.inspectElements(options.slideSelector, {
        inputIsSvg,
        excludeSelector: options.excludeSelector,
        slideIdAttribute: options.slideIdAttribute,
        identityAttribute: options.identityAttribute,
        identityDiagnostics,
        excludedCount: excludedCounter,
      });

      if (elements.length === 0) {
        elements.push({
          type: 'text',
          tag: 'p',
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          styles: {},
          content: '',
        });
      }

      collectFontsFromElements(elements, platformFontContext, usedFontsMap);

      slidesMap = await inspector.detectSlides(
        elements,
        options.slideSelector,
        options.splitByHeight
      );
    }

    return { slidesMap, slideCoordsNormalized, excludedCount: excludedCounter.value };
  } finally {
    await loader.close().catch(() => {});
  }
}

function mergeSlidesMaps(
  target: Map<number, ElementInfo[]>,
  source: Map<number, ElementInfo[]>,
  slideOffset: number
): number {
  for (const [idx, elements] of source) {
    target.set(slideOffset + idx, elements);
  }
  return slideOffset + source.size;
}

function reportUsedFonts(
  usedFontsDeduped: string[],
  fontStats?: ReturnType<typeof buildFontStats>
): void {
  if (usedFontsDeduped.length === 0) return;
  console.log(`\n📝 Fonts used in this presentation:`);
  usedFontsDeduped.forEach((name) => {
    console.log(`  - ${name}`);
  });

  const embed = fontStats?.embed;
  if (embed && (embed.matched.length > 0 || embed.unmatched.length > 0)) {
    console.log(`\n🔤 Cloud embed font library (${embed.indexMeta.familyCount} families):`);
    for (const item of embed.matched) {
      const note =
        item.used === item.matchedFamily
          ? 'matched'
          : `matched → ${item.matchedFamily}`;
      console.log(`  ✓ ${item.used} (${note})`);
    }
    for (const name of embed.unmatched) {
      console.log(`  ✗ ${name} (not in library)`);
    }
    if (embed.matched.length > 0) {
      console.log(
        '\n💡 Cloud: use --mode cloud --embed-fonts to embed matched fonts into the PPTX so anyone opening the file sees the same typography.'
      );
    }
  }

  console.log('\n💡 Make sure these fonts are installed on the system where the PPTX will be opened.\n');
}

/**
 * Web-safe / generic system font families that are always considered available
 * and therefore never trigger `strict.failOnMissingFonts` (DH-P0-003).
 */
const WEB_SAFE_FONTS = new Set([
  'arial',
  'helvetica',
  'helvetica neue',
  'times',
  'times new roman',
  'georgia',
  'courier',
  'courier new',
  'verdana',
  'tahoma',
  'trebuchet ms',
  'geneva',
  'palatino',
  'garamond',
  'bookman',
  'comic sans ms',
  'impact',
  'system-ui',
  'system',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'roboto',
  'noto sans',
  'noto serif',
  'open sans',
  'lato',
  'montserrat',
  'source sans pro',
  'inter',
]);

function isWebSafeFont(family: string): boolean {
  return WEB_SAFE_FONTS.has(family.trim().toLowerCase());
}

/**
 * Resolve the effective strict-mode configuration (DH-P0-003).
 *
 * When `strict` is present, every gate defaults to its strictest value unless
 * the caller explicitly relaxes it.
 */
function resolveStrictConfig(
  strict: import('./types').StrictConversionOptions | undefined,
): Required<import('./types').StrictConversionOptions> | null {
  if (!strict) return null;
  return {
    requireElementIdentity: strict.requireElementIdentity ?? true,
    allowRaster: strict.allowRaster ?? false,
    allowUnsupported: strict.allowUnsupported ?? false,
    allowRemoteResources: strict.allowRemoteResources ?? false,
    failOnMissingFonts: strict.failOnMissingFonts ?? true,
  };
}

/**
 * Enforce strict-mode gates after a conversion (DH-P0-003).
 *
 * Throws ConversionError (carrying the offending diagnostics) when any gate is
 * violated. Never returns a seemingly-successful PPTX for a strict run that
 * actually degraded.
 */
function enforceStrictMode(args: {
  strict: Required<import('./types').StrictConversionOptions>;
  report: import('./conversion-report').DeckHtmlConversionReport;
  resourceDiagnostics: import('./utils/resource-policy').ResourceDiagnostic[];
  fontStats: import('./conversion-report').ConversionFontStats;
  identityDiagnostics: Diagnostic[];
}): never | void {
  const { strict, report, resourceDiagnostics, fontStats, identityDiagnostics } = args;
  const failures: Diagnostic[] = [];

  // requireElementIdentity: every converted semantic element must declare an identity.
  // We check the report's per-element records (the source of truth for what was
  // actually mapped) rather than the raw inspected set, so structural containers
  // that were ignored or never produced a PPTX object don't trigger the gate.
  if (strict.requireElementIdentity) {
    const missing: { slide: string | null; kind: string }[] = [];
    for (const slide of report.slides) {
      for (const rec of slide.elements) {
        if (rec.mapping_mode === 'ignored') continue;
        if (!rec.element_id) {
          missing.push({ slide: slide.slide_id, kind: rec.kind });
        }
      }
    }
    if (missing.length > 0) {
      failures.push({
        rule_id: RULE_IDS.IDENTITY_MISSING,
        severity: 'error',
        message: `strict mode: ${missing.length} converted element(s) lack a declared identity (e.g. "${missing[0]!.kind}" on slide ${missing[0]!.slide ?? 1}). Set data-element-id on every semantic element or relax requireElementIdentity.`,
        recovery: 'Add data-element-id to every visible semantic element, or set strict.requireElementIdentity=false.',
      });
    }
  }

  // allowRaster: no raster fallbacks allowed.
  if (!strict.allowRaster) {
    if (report.summary.raster > 0) {
      failures.push({
        rule_id: RULE_IDS.RASTER_FALLBACK,
        severity: 'error',
        message: `strict mode: ${report.summary.raster} element(s) fell back to raster. Set strict.allowRaster=true to permit raster fallbacks.`,
        recovery: 'Replace rasterized content with native/vector equivalents, or set strict.allowRaster=true.',
      });
    }
  }

  // allowUnsupported: no unsupported elements allowed.
  if (!strict.allowUnsupported) {
    if (report.summary.unsupported > 0) {
      failures.push({
        rule_id: RULE_IDS.KIND_UNSUPPORTED,
        severity: 'error',
        message: `strict mode: ${report.summary.unsupported} element(s) are unsupported. Set strict.allowUnsupported=true to permit unsupported kinds.`,
        recovery: 'Replace unsupported elements with text/image/shape/table/group, or set strict.allowUnsupported=true.',
      });
    }
  }

  // allowRemoteResources: no remote resource access allowed.
  if (!strict.allowRemoteResources) {
    const remoteBlocked = resourceDiagnostics.filter(
      (d) => d.rule_id === RULE_IDS.RESOURCE_REMOTE_BLOCKED,
    );
    if (remoteBlocked.length > 0) {
      failures.push({
        rule_id: RULE_IDS.RESOURCE_REMOTE_BLOCKED,
        severity: 'error',
        message: `strict mode: ${remoteBlocked.length} remote resource request(s) were blocked. Set strict.allowRemoteResources=true to permit remote resources.`,
        recovery: 'Inline remote resources locally, or set strict.allowRemoteResources=true.',
      });
    }
  }

  // failOnMissingFonts: no unresolved fonts allowed.
  if (strict.failOnMissingFonts) {
    const unmatched = (fontStats.embed?.unmatched ?? []).filter(
      (f) => !isWebSafeFont(f),
    );
    if (unmatched.length > 0) {
      failures.push({
        rule_id: RULE_IDS.FONT_MISSING,
        severity: 'error',
        message: `strict mode: ${unmatched.length} font family(ies) could not be resolved: ${unmatched.join(', ')}. Set strict.failOnMissingFonts=false to permit font fallbacks.`,
        recovery: 'Install the missing fonts, embed them via the cloud pipeline, or set strict.failOnMissingFonts=false.',
      });
    }
  }

  if (failures.length > 0) {
    const additional = [
      ...identityDiagnostics,
      ...resourceDiagnostics.map((d) => ({
        rule_id: d.rule_id,
        severity: d.severity,
        message: d.message,
        recovery: d.recovery,
      })),
    ];
    throw new ConversionError(failures[0]!, additional);
  }
}

/**
 * Inspect HTML inputs and collect slide/element/font statistics without generating PPTX.
 */
export async function inspectHtmlFonts(
  options: ConversionOptions
): Promise<{
  usedFonts: string[];
  slideCount: number;
  stats: NonNullable<ConversionResult['stats']>;
}> {
  return runQuietly(Boolean(options.quiet), async () => {
    const inputPaths = resolveInputPaths(options);
    const platformFontContext = buildPlatformFontContext(options);
    const loader = new HTMLLoader();
    const mergedSlidesMap = new Map<number, ElementInfo[]>();
    const usedFontsMap = new Map<string, UsedFontDescriptor>();
    let slideCoordsNormalized = false;
    const resourceDiagnostics: import('./utils/resource-policy').ResourceDiagnostic[] = [];
    const identityDiagnostics: import('./utils/diagnostics').Diagnostic[] = [];

    await loader.init(
      {
        executablePath: options.browser?.executablePath,
        userDataDir: options.browser?.userDataDir,
        headless: options.browser?.headless,
        args: options.browser?.args,
      },
      {
        browser: options.browser?.browser,
        browserContext: options.browser?.browserContext,
      },
    );

    try {
      let slideOffset = 0;
      for (let i = 0; i < inputPaths.length; i++) {
        const inputPath = inputPaths[i]!;
        const result = await processSingleInput(
          loader,
          inputPath,
          options,
          platformFontContext,
          usedFontsMap,
          undefined,
          resourceDiagnostics,
          identityDiagnostics
        );
        slideCoordsNormalized = slideCoordsNormalized || result.slideCoordsNormalized;
        slideOffset = mergeSlidesMaps(mergedSlidesMap, result.slidesMap, slideOffset);
      }

      const usedFontsDeduped = [
        ...new Set(Array.from(usedFontsMap.values()).map((d) => d.fontFamily)),
      ].sort();

      return {
        usedFonts: usedFontsDeduped,
        slideCount: mergedSlidesMap.size,
        stats: {
          elements: buildElementStats(mergedSlidesMap),
          fonts: buildFontStats(usedFontsMap),
          simplified: buildSimplifiedStats(mergedSlidesMap),
        },
      };
    } finally {
      await loader.close().catch(() => {});
    }
  });
}

/**
 * Convert one or more HTML/SVG files to a single PPTX.
 * Each input file becomes one slide by default; use slideSelector or splitByHeight
 * within a file to produce multiple slides from that file.
 */
export async function convertHtmlToPptx(
  options: ConversionOptions
): Promise<ConversionResult> {
  return runQuietly(Boolean(options.quiet), async () => {
    const inputPaths = resolveInputPaths(options);
    const platformFontContext = buildPlatformFontContext(options);
    const loader = new HTMLLoader();
    const mergedSlidesMap = new Map<number, ElementInfo[]>();
    const usedFontsMap = new Map<string, UsedFontDescriptor>();
    let slideCoordsNormalized = false;
    const resourceDiagnostics: import('./utils/resource-policy').ResourceDiagnostic[] = [];
    const identityDiagnostics: import('./utils/diagnostics').Diagnostic[] = [];

    await loader.init(
      {
        executablePath: options.browser?.executablePath,
        userDataDir: options.browser?.userDataDir,
        headless: options.browser?.headless,
        args: options.browser?.args,
      },
      {
        browser: options.browser?.browser,
        browserContext: options.browser?.browserContext,
      },
    );

    const inspectConcurrency = resolveSlideInspectConcurrency();
    let totalExcludedCount = 0;
  const parallelInputs = inputPaths.length > 1 && inspectConcurrency > 1;
  if (parallelInputs) {
    const fileConcurrency = Math.min(inspectConcurrency, inputPaths.length);
    console.log(
      `⚡ Parallel inputs: ${fileConcurrency} HTML files at a time (CPU cores − 2)`
    );

    const indexed = inputPaths.map((path, index) => ({ path, index }));
    const completed = await runAsyncPool(
      indexed,
      fileConcurrency,
      async ({ path, index }) => {
        console.log(`\n📄 Processing ${index + 1}/${inputPaths.length}: ${path}`);
        const fileLoader = new HTMLLoader();
        await fileLoader.init(
          {
            executablePath: options.browser?.executablePath,
            userDataDir: options.browser?.userDataDir,
            headless: options.browser?.headless,
            args: options.browser?.args,
          },
          {
            browser: options.browser?.browser,
            browserContext: options.browser?.browserContext,
          },
        );
        try {
          const result = await processSingleInput(
            fileLoader,
            path,
            options,
            platformFontContext,
            usedFontsMap,
            { slideInspectConcurrency: 1 },
            resourceDiagnostics,
            identityDiagnostics
          );
          return { index, result };
        } finally {
          await fileLoader.close().catch(() => {});
        }
      }
    );

    completed.sort((a, b) => a.index - b.index);
    let slideOffset = 0;
    for (const { result } of completed) {
      slideCoordsNormalized = slideCoordsNormalized || result.slideCoordsNormalized;
      totalExcludedCount += result.excludedCount;
      slideOffset = mergeSlidesMaps(mergedSlidesMap, result.slidesMap, slideOffset);
    }
  } else {
    let slideOffset = 0;
    for (let i = 0; i < inputPaths.length; i++) {
      const inputPath = inputPaths[i];
      if (inputPaths.length > 1) {
        console.log(`\n📄 Processing ${i + 1}/${inputPaths.length}: ${inputPath}`);
      }

      const result = await processSingleInput(
        loader,
        inputPath,
        options,
        platformFontContext,
        usedFontsMap,
        undefined,
        resourceDiagnostics,
        identityDiagnostics
      );
      slideCoordsNormalized = slideCoordsNormalized || result.slideCoordsNormalized;
      totalExcludedCount += result.excludedCount;
      slideOffset = mergeSlidesMaps(mergedSlidesMap, result.slidesMap, slideOffset);
    }
  }

  const usedFontsDeduped = [...new Set(Array.from(usedFontsMap.values()).map((d) => d.fontFamily))].sort();
  const fontStats = buildFontStats(usedFontsMap);

  const generator = new PPTXGenerator({
    platformFontContext,
    splitByHeight: options.splitByHeight,
    slideSelector: options.slideSelector,
    slideCoordsNormalized,
  });
  generator.report.ignoredCount = totalExcludedCount;
  for (const d of identityDiagnostics) generator.report.diagnostics.push(d);
  for (const d of resourceDiagnostics) {
    generator.report.diagnostics.push({
      rule_id: d.rule_id,
      severity: d.severity,
      message: d.message,
      recovery: d.recovery,
    });
  }
  const data = await generator.generate(mergedSlidesMap);
  const slideCount = generator.getSlideCount();
  const conversionReport = generator.report.build('@deckflow/deckhtml', ENGINE_VERSION, 'succeeded');

  // Font Awesome is the only font family embedded locally — its icon glyphs must
  // travel with the PPTX or icons render as empty boxes on machines without FA.
  // All other font embedding is handled by the cloud pipeline.
  const dataWithFaFonts = await embedFontAwesomeFonts(data);

  reportUsedFonts(usedFontsDeduped, fontStats);

  // Aggregate unified diagnostics (DH-P0-009): identity + resource + report-level.
  const unifiedDiagnostics = new DiagnosticsCollector();
  unifiedDiagnostics.pushMany(identityDiagnostics);
  for (const d of resourceDiagnostics) {
    unifiedDiagnostics.push({
      rule_id: d.rule_id,
      severity: d.severity,
      message: d.message,
      recovery: d.recovery,
    });
  }
  unifiedDiagnostics.pushMany(conversionReport.diagnostics ?? []);

  // DH-P0-003: enforce strict-mode gates before returning a successful result.
  const strictConfig = resolveStrictConfig(options.strict);
  if (strictConfig) {
    enforceStrictMode({
      strict: strictConfig,
      report: conversionReport,
      resourceDiagnostics,
      fontStats,
      identityDiagnostics,
    });
  }

  return {
    data: dataWithFaFonts,
    usedFonts: usedFontsDeduped,
    slideCount,
    stats: {
      elements: buildElementStats(mergedSlidesMap),
      fonts: fontStats,
      simplified: buildSimplifiedStats(mergedSlidesMap),
    },
    resourceDiagnostics,
    identityDiagnostics,
    diagnostics: unifiedDiagnostics.toJSON(),
    report: conversionReport,
  };
  });
}

export default convertHtmlToPptx;
