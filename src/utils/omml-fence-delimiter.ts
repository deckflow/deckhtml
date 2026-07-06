/**
 * mathml2omml emits fence operators (e.g. KaTeX `\begin{cases}` → `<mo fence="true">{</mo>`)
 * as plain `<m:r><m:t>{</m:t></m:r>`. PowerPoint needs `<m:d>` with `<m:begChr>` for stretchy braces.
 */

const DELIMITER_PAIRS: Record<
  string,
  {
    /**
     * PowerPoint `<m:begChr m:val="..."/>` / `<m:endChr m:val="..."/>` values.
     * For example, KaTeX absolute value may be emitted as `∣` in `<m:t>`,
     * but PowerPoint wants `|` in `m:val` to render/stretch correctly.
     */
    begVal: string;
    endVal: string;
    /**
     * The character we expect in the closing fence `<m:t>...</m:t>`.
     * (It can differ from `endVal`, e.g. `∣` in OMML but output wants `|`.)
     */
    endRunChar: string;
  }
> = {
  '{': { begVal: '{', endVal: '', endRunChar: '' },
  '(': { begVal: '(', endVal: ')', endRunChar: ')' },
  '[': { begVal: '[', endVal: ']', endRunChar: ']' },
  '|': { begVal: '|', endVal: '|', endRunChar: '|' },
  '∣': { begVal: '|', endVal: '|', endRunChar: '∣' },
  '‖': { begVal: '‖', endVal: '‖', endRunChar: '‖' },
  '⌊': { begVal: '⌊', endVal: '⌋', endRunChar: '⌋' },
  '⌈': { begVal: '⌈', endVal: '⌉', endRunChar: '⌉' },
};

function findClosingTag(s: string, afterOpenGt: number, tagName: string): number {
  const openNeedle = new RegExp(`<${tagName}\\b`, 'i');
  const close = `</${tagName}>`;
  let depth = 1;
  let i = afterOpenGt;
  while (i < s.length && depth > 0) {
    const nextClose = s.indexOf(close, i);
    if (nextClose === -1) return -1;
    const slice = s.slice(i, nextClose);
    const openInSlice = slice.search(openNeedle);
    const nextOpen = openInSlice === -1 ? -1 : i + openInSlice;
    if (nextOpen !== -1) {
      depth++;
      const m = s.slice(nextOpen).match(openNeedle);
      i = nextOpen + (m ? m[0].length : 1);
    } else {
      depth--;
      if (depth === 0) return nextClose;
      i = nextClose + close.length;
    }
  }
  return -1;
}

function escapeOmmlAttr(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * Optional run properties before `<m:t>` (mathml2omml may emit `m:rPr` or DrawingML `a:rPr`).
 * `\b` must sit on the tag name (before `>`), not after `>` — otherwise `\b` never matches.
 */
const FENCE_RUN_RPR =
  '(?:\\s*(?:<m:rPr\\b[^>]*(?:/>|>[\\s\\S]*?</m:rPr>)|<a:rPr\\b[^>]*(?:/>|>[\\s\\S]*?</a:rPr>)))?';

/** Opening fence runs only (closing `]` / `)` are matched via {@link fenceCloseRunPattern}). */
const FENCE_CHAR_RUN = new RegExp(
  `<m:r\\b[^>]*>${FENCE_RUN_RPR}\\s*<m:t[^>]*>([\\(\\[\\|‖⌊⌈∣\\{])</m:t>\\s*</m:r>`,
  'i'
);

/**
 * Match opening fence run immediately before a multi-line block (`cases`-like).
 *
 * NOTE: mathml2omml sometimes inserts an extra whitespace `<m:r><m:t> </m:t></m:r>`
 * between the opening `{` run and the following `<m:m>` block. Allow those whitespace
 * runs in-between, otherwise the fence repair won't trigger and PPT renders a
 * single-line `{`.
 */
const FENCE_RUN_BEFORE_MATRIX = new RegExp(
  `<m:r\\b[^>]*>${FENCE_RUN_RPR}\\s*<m:t[^>]*>([\\{\\(\\[\\|‖⌊⌈∣])</m:t>\\s*</m:r>` +
    `(?:\\s*<m:r\\b[^>]*>${FENCE_RUN_RPR}\\s*<m:t[^>]*>\\s*</m:t>\\s*</m:r>)*` +
    `\\s*<m:(m|eqArr)\\b`,
  'i'
);

/** OMML blocks that need stretchy paired fences (e.g. `\left(\frac{…}{…}\right)`). */
const TALL_OMML_TAG =
  /^<m:(?:f|m|rad|nary|d|eqArr|sSub|sSup|sSubSup|limLow|limUpp|acc|groupChr|bar|box|borderBox)\b/i;

/**
 * Delimiters that should wrap the full inner span (not only a single tall OMML node).
 *
 * Keep this narrow: broad wrapping around `(` / `|` has caused invalid OMML in some inputs.
 */
const WRAP_FULL_INNER_DELIMITERS = new Set(['[']);

/**
 * Some inputs produce `(` / `)` as plain runs even when the inner span contains tall OMML
 * (fractions, radicals, eqArr, etc.). If we only check the immediate next sibling, PPT
 * renders a non-stretchy single-line parenthesis. For `(`, we wrap the full inner span
 * when it contains any tall OMML tag.
 */
const WRAP_FULL_INNER_IF_CONTAINS_TALL = new Set(['(']);

const PAIRED_BRACE: (typeof DELIMITER_PAIRS)['['] = { begVal: '{', endVal: '}', endRunChar: '}' };

/**
 * KaTeX `cases` 数学块在 mathml2omml 后常被 PPT 解释为居中对齐。
 * 但在 `{ ... }` 的“分行方程”语义下，通常希望每一行都从左侧对齐。
 *
 * 这里对夹在 `{` fence 中的矩阵，强制把 baseJc/mcJc 从 center 改成 left。
 */
function forceMatrixLeftAlignmentForCases(matrixXml: string): string {
  // Only patch inside the captured matrix xml (safe scoping).
  return matrixXml
    .replace(/(<m:(?:baseJc|mcJc)\b[^>]*m:val=")center(")/gi, '$1left$2')
    // Some converters may emit uppercase; keep this defensive.
    .replace(/(<m:(?:baseJc|mcJc)\b[^>]*m:val=")CENTER(")/gi, '$1left$2')
    // PowerPoint sometimes keeps extra centering/indent when matrix placeholders are hidden.
    // Dropping plcHide has proven more stable than structural conversions for multi-column cases.
    .replace(/<m:plcHide\b[^>]*\/>/gi, '')
    // Some PPT builds appear to ignore `mcJc` when it is expressed via `<m:count m:val="2"/>`.
    // Expand it into two explicit columns to force per-column left alignment.
    .replace(
      /<m:mcs>\s*<m:mc>\s*<m:mcPr>\s*<m:count\b[^>]*m:val="2"[^>]*\/>\s*<m:mcJc\b[^>]*m:val="left"[^>]*\/>\s*<\/m:mcPr>\s*<\/m:mc>\s*<\/m:mcs>/gi,
      '<m:mcs><m:mc><m:mcPr><m:count m:val="1"/><m:mcJc m:val="left"/></m:mcPr></m:mc><m:mc><m:mcPr><m:count m:val="1"/><m:mcJc m:val="left"/></m:mcPr></m:mc></m:mcs>'
    );
}

/**
 * PowerPoint 对 `<m:m>`（矩阵）在 “cases” 这种单列多行场景下，经常仍按单元格居中渲染。
 * Word/PowerPoint 的原生 “cases/分段函数” 更常用 `<m:eqArr>` 来承载多行。
 *
 * 把 `<m:m> ... <m:mr><m:e>...</m:e></m:mr>... </m:m>` 转成：
 * `<m:eqArr><m:eqArrPr><m:baseJc m:val="top"/></m:eqArrPr><m:e>...</m:e>...</m:eqArr>`
 */
function convertCasesMatrixToEqArr(matrixXml: string): string | null {
  if (!/^<m:m\b/i.test(matrixXml.trim())) return null;

  // Only safe for single-column "cases" blocks.
  // If the matrix has multiple columns (e.g. value + condition), converting to eqArr can
  // easily generate invalid OMML and/or drop columns depending on converter output.
  const colCountStr = matrixXml.match(/<m:count\b[^>]*m:val="(\d+)"[^>]*\/?>/i)?.[1];
  const colCount = colCountStr ? Number(colCountStr) : 1;
  if (colCount > 1) return null;

  const rows = [...matrixXml.matchAll(/<m:mr\b[^>]*>[\s\S]*?<\/m:mr>/gi)].map((m) => m[0]);
  if (!rows.length) return null;

  const es: string[] = [];
  for (const row of rows) {
    const eBlocks = [...row.matchAll(/<m:e\b[^>]*>[\s\S]*?<\/m:e>/gi)].map((m) => m[0]);
    if (!eBlocks.length) return null;

    es.push(eBlocks[0]);
  }

  // Force "left" by adding eqArr alignment markers at the beginning of each row.
  // In OMML eqArr, alignment points are ampersands in their own m:r — never merge
  // into the first token (e.g. accent base "x" → visible "&x" in PowerPoint).
  const prefixEqArrRowLeftMarker = (eXml: string): string => {
    if (/^<m:e\b[^>]*>\s*<m:r\b[^>]*>\s*<m:t\b[^>]*>\s*&amp;\s*<\/m:t>/i.test(eXml)) {
      return eXml;
    }
    return eXml.replace(/^(<m:e\b[^>]*>)/i, '$1<m:r><m:t>&amp;</m:t></m:r>');
  };

  const esWithMarkers = es.map(prefixEqArrRowLeftMarker);

  // Minimal eqArrPr: keep it simple to avoid PPT repair.
  return `<m:eqArr><m:eqArrPr><m:baseJc m:val="top"/></m:eqArrPr>${esWithMarkers.join(
    ''
  )}</m:eqArr>`;
}

/**
 * For `{ ... }` (cases) blocks, PowerPoint sometimes still renders each line centered
 * because the whole <m:oMathPara> is set to m:jc="center".
 *
 * If we detect a paragraph that contains our `{` stretchy delimiter (<m:begChr m:val="{"/>),
 * force its paragraph alignment to left.
 */
function forceCasesParagraphLeftAlignment(omml: string): string {
  const closeNeedle = '</m:oMathPara>';
  let i = 0;
  let out = '';

  while (i < omml.length) {
    const start = omml.indexOf('<m:oMathPara', i);
    if (start === -1) {
      out += omml.slice(i);
      break;
    }
    out += omml.slice(i, start);

    const close = omml.indexOf(closeNeedle, start);
    if (close === -1) {
      out += omml.slice(start);
      break;
    }

    const end = close + closeNeedle.length;
    let para = omml.slice(start, end);

    const hasCasesBrace = /<m:begChr\b[^>]*m:val="\{"/i.test(para);
    if (hasCasesBrace) {
      para = para.replace(
        /<m:jc\b[^>]*m:val="center"[^>]*\/?>/i,
        (tag) => tag.replace(/m:val=\"center\"/i, 'm:val="left"')
      );
    }

    out += para;
    i = end;
  }

  return out;
}

function buildDelimiterOmml(beg: string, end: string, inner: string): string {
  const begAttr = escapeOmmlAttr(beg);
  const endAttr = escapeOmmlAttr(end);
  return (
    `<m:d><m:dPr><m:begChr m:val="${begAttr}"/><m:endChr m:val="${endAttr}"/><m:grow/></m:dPr>` +
    `<m:e>${inner}</m:e></m:d>`
  );
}

function fenceCloseRunPattern(endCh: string): RegExp {
  const esc = endCh.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  return new RegExp(
    `^\\s*<m:r\\b[^>]*>${FENCE_RUN_RPR}\\s*<m:t[^>]*>${esc}<\\/m:t>\\s*<\\/m:r>`,
    'i'
  );
}

/** Closing fence characters that may differ from the opening run (e.g. `∣` vs `|`). */
function fenceCloseRunCandidates(openCh: string, pair: (typeof DELIMITER_PAIRS)[string]): string[] {
  const chars = new Set<string>();
  if (pair.endRunChar) chars.add(pair.endRunChar);
  if (openCh === '∣' || openCh === '|') {
    chars.add('∣');
    chars.add('|');
  }
  return [...chars];
}

function findFenceCloseRun(
  afterInner: string,
  openCh: string,
  pair: (typeof DELIMITER_PAIRS)[string]
): RegExpExecArray | null {
  for (const ch of fenceCloseRunCandidates(openCh, pair)) {
    const m = fenceCloseRunPattern(ch).exec(afterInner);
    if (m) return m;
  }
  return null;
}

function skipOmmlWs(s: string, pos: number): number {
  let i = pos;
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

/** Advance past one top-level OMML sibling (`<m:r>`, `<m:f>`, …). */
function consumeNextOmmlSibling(s: string, pos: number): number {
  const i = skipOmmlWs(s, pos);
  if (i >= s.length) return i;
  const tag = s.slice(i).match(/^<(m:\w+)\b/i);
  if (!tag) return i + 1;
  const tagName = tag[1];
  const openGt = s.indexOf('>', i);
  if (openGt === -1) return s.length;
  const close = findClosingTag(s, openGt + 1, tagName);
  if (close === -1) return s.length;
  return close + `</${tagName}>`.length;
}

/**
 * Find the closing fence run that matches an opening delimiter, respecting nesting
 * (e.g. `\left[ a \left[ b \right] c \right]`).
 */
function findMatchingFenceCloseRun(
  afterOpen: string,
  openCh: string,
  pair: (typeof DELIMITER_PAIRS)[string]
): { index: number; length: number } | null {
  if (!pair.endRunChar) return null;

  let depth = 1;
  let pos = 0;

  while (pos < afterOpen.length && depth > 0) {
    pos = skipOmmlWs(afterOpen, pos);
    if (pos >= afterOpen.length) break;

    const tail = afterOpen.slice(pos);
    const nestedOpen = FENCE_CHAR_RUN.exec(tail);
    if (nestedOpen?.index === 0 && nestedOpen[1] === openCh) {
      depth++;
      pos += nestedOpen[0].length;
      continue;
    }

    let closed = false;
    for (const ch of fenceCloseRunCandidates(openCh, pair)) {
      const closeM = fenceCloseRunPattern(ch).exec(tail);
      if (closeM?.index === 0) {
        depth--;
        if (depth === 0) return { index: pos, length: closeM[0].length };
        pos += closeM[0].length;
        closed = true;
        break;
      }
    }
    if (closed) continue;

    const next = consumeNextOmmlSibling(afterOpen, pos);
    if (next <= pos) break;
    pos = next;
  }

  return null;
}

/**
 * mathml2omml may merge a fence opener with the next token into one run (`[−`, `(−`, …).
 * Do not treat `(x−μ` inside a fraction as a stretchy fence — only unary-operator suffixes.
 */
function isMergedOpenFenceSuffix(openCh: string, suffix: string): boolean {
  if (openCh === '[') return true;
  if (openCh === '(') return /^[\-−+±]$/.test(suffix.trim());
  return false;
}

/** mathml2omml may merge `[` + `−` or `(` + `−` into `<m:t>[−</m:t>` / `<m:t>(−</m:t>`. */
const MERGED_FENCE_PREFIX_RUN = new RegExp(
  `<m:r\\b[^>]*>${FENCE_RUN_RPR}\\s*<m:t([^>]*)>([\\(\\[])([^<]+)<\\/m:t>\\s*<\\/m:r>`,
  'i'
);

/** Closing `]` / `}` merged into prior text (e.g. MathJax `\right]` → `<m:t>…]</m:t>`). */
const MERGED_FENCE_CLOSE_SUFFIX_RUN = new RegExp(
  `<m:r\\b[^>]*>${FENCE_RUN_RPR}\\s*<m:t([^>]*)>([^<\\[\\]\\{\\}]+)([\\]\\}])<\\/m:t>\\s*<\\/m:r>`,
  'i'
);

function fixMergedFenceCloseSuffixRuns(omml: string): string {
  return omml.replace(MERGED_FENCE_CLOSE_SUFFIX_RUN, (_full, attrs: string, prefix: string, closeCh: string) => {
    const prefixRun = `<m:r><m:t${attrs}>${prefix}</m:t></m:r>`;
    const closeRun = `<m:r><m:t${attrs}>${closeCh}</m:t></m:r>`;
    return prefixRun + closeRun;
  });
}

function fixMergedFencePrefixRuns(omml: string): string {
  let result = '';
  let i = 0;

  while (i < omml.length) {
    const tail = omml.slice(i);
    const m = MERGED_FENCE_PREFIX_RUN.exec(tail);
    if (!m) {
      result += tail;
      break;
    }

    const openCh = m[2];
    const suffix = m[3];
    if (openCh === '{' || openCh === '}' || !isMergedOpenFenceSuffix(openCh, suffix)) {
      result += tail.slice(0, m.index + m[0].length);
      i += m.index + m[0].length;
      continue;
    }

    const pair = DELIMITER_PAIRS[openCh];
    if (!pair?.endRunChar) {
      result += tail.slice(0, m.index + 1);
      i += m.index + 1;
      continue;
    }

    const afterOpen = m.index + m[0].length;
    const rest = tail.slice(afterOpen);
    const closeRun = findMatchingFenceCloseRun(rest, openCh, pair);
    if (!closeRun) {
      result += tail.slice(0, m.index + 1);
      i += m.index + 1;
      continue;
    }

    const prefixRun = `<m:r><m:t${m[1]}>${suffix}</m:t></m:r>`;
    const innerXml = prefixRun + rest.slice(0, closeRun.index);
    result += tail.slice(0, m.index);
    result += buildDelimiterOmml(pair.begVal, pair.endVal, innerXml);
    i += afterOpen + closeRun.index + closeRun.length;
  }

  return result;
}

/**
 * mathml2omml (or a prior pass) may already emit stretchy `<m:endChr/>` inside `<m:d>` while
 * leaving a duplicate plain closing fence run immediately after `</m:d>`.
 */
function stripRedundantFenceRunAfterDelimiter(omml: string): string {
  return omml.replace(
    new RegExp(
      `(<m:d\\b[^>]*>[\\s\\S]*?<m:endChr\\b[^>]*m:val="(?:\\||&#124;)"[^>]*/>[\\s\\S]*?</m:d>)\\s*<m:r\\b[^>]*>${FENCE_RUN_RPR}\\s*<m:t[^>]*>[|∣]<\\/m:t>\\s*<\\/m:r>`,
      'gi'
    ),
    '$1'
  );
}

/**
 * KaTeX `\left(…\right)` / `\left[…\right]` become plain `<m:r><m:t>(</m:t></m:r>` siblings.
 * Wrap the full inner span in stretchy `<m:d>` (height follows content).
 * Skips `{` — handled by {@link fixOmmlFenceBeforeMatrix} for `cases`.
 */
function fixOmmlPairedFenceDelimiters(omml: string): string {
  let result = '';
  let i = 0;

  while (i < omml.length) {
    const tail = omml.slice(i);
    const m = FENCE_CHAR_RUN.exec(tail);
    if (!m) {
      result += tail;
      break;
    }

    const openCh = m[1];
    // Skip `{` here to avoid skipping nested delimiters inside `{...}`.
    // `{...}` is handled by {@link fixOmmlPairedCurlyBraceDelimiters} as a later pass.
    if (openCh === '{' || openCh === '}') {
      result += tail.slice(0, m.index + m[0].length);
      i += m.index + m[0].length;
      continue;
    }

    const pair = DELIMITER_PAIRS[openCh];
    if (!pair?.endRunChar) {
      result += tail.slice(0, m.index + 1);
      i += m.index + 1;
      continue;
    }

    const afterOpen = m.index + m[0].length;
    const rest = tail.slice(afterOpen);

    if (WRAP_FULL_INNER_DELIMITERS.has(openCh)) {
      const closeRun = findMatchingFenceCloseRun(rest, openCh, pair);
      if (closeRun) {
        const innerXml = rest.slice(0, closeRun.index);
        result += tail.slice(0, m.index);
        result += buildDelimiterOmml(pair.begVal, pair.endVal, innerXml);
        i += m.index + m[0].length + closeRun.index + closeRun.length;
        continue;
      }
    }

    if (WRAP_FULL_INNER_IF_CONTAINS_TALL.has(openCh)) {
      const closeRun = findMatchingFenceCloseRun(rest, openCh, pair);
      if (closeRun) {
        const innerXml = rest.slice(0, closeRun.index);
        if (/<m:(?:f|m|rad|nary|d|eqArr|sSub|sSup|sSubSup|limLow|limUpp|acc|groupChr|bar|box|borderBox)\b/i.test(innerXml)) {
          result += tail.slice(0, m.index);
          result += buildDelimiterOmml(pair.begVal, pair.endVal, innerXml);
          i += m.index + m[0].length + closeRun.index + closeRun.length;
          continue;
        }
      }
    }

    const ws = rest.length - rest.trimStart().length;
    const innerStart = i + afterOpen + ws;
    const innerHead = omml.slice(innerStart);

    if (!TALL_OMML_TAG.test(innerHead)) {
      result += tail.slice(0, afterOpen);
      i += afterOpen;
      continue;
    }

    const tagMatch = innerHead.match(/^<(m:\w+)\b/i);
    if (!tagMatch) {
      result += tail.slice(0, afterOpen);
      i += afterOpen;
      continue;
    }

    const tagName = tagMatch[1];
    const openGt = omml.indexOf('>', innerStart);
    if (openGt === -1) {
      result += tail.slice(0, afterOpen);
      i += afterOpen;
      continue;
    }

    const innerClose = findClosingTag(omml, openGt + 1, tagName);
    if (innerClose === -1) {
      result += tail.slice(0, afterOpen);
      i += afterOpen;
      continue;
    }

    const innerEnd = innerClose + `</${tagName}>`.length;
    const afterInner = omml.slice(innerEnd);
    const closeRun = findFenceCloseRun(afterInner, openCh, pair);
    if (!closeRun) {
      result += tail.slice(0, afterOpen);
      i += afterOpen;
      continue;
    }

    const innerXml = omml.slice(innerStart, innerEnd);
    result += tail.slice(0, m.index);
    result += buildDelimiterOmml(pair.begVal, pair.endVal, innerXml);
    i = innerEnd + closeRun[0].length;
  }

  return result;
}

/**
 * Wrap paired `{ ... }` fences (e.g. MathJax `\\left\\{...\\right\\}`) in stretchy `<m:d>`.
 *
 * IMPORTANT: run this AFTER {@link fixOmmlPairedFenceDelimiters} so that inner `[`/`(` etc.
 * are already converted; otherwise the `{...}` wrapper would skip processing the inner span.
 *
 * This does NOT affect KaTeX `cases` since those are handled by {@link fixOmmlFenceBeforeMatrix}
 * and do not have a matching closing `}` fence run.
 */
function fixOmmlPairedCurlyBraceDelimiters(omml: string): string {
  let result = '';
  let i = 0;

  while (i < omml.length) {
    const tail = omml.slice(i);
    const m = FENCE_CHAR_RUN.exec(tail);
    if (!m) {
      result += tail;
      break;
    }

    const openCh = m[1];
    if (openCh !== '{') {
      result += tail.slice(0, m.index + m[0].length);
      i += m.index + m[0].length;
      continue;
    }

    const afterOpen = m.index + m[0].length;
    const rest = tail.slice(afterOpen);
    const closeRun = findMatchingFenceCloseRun(rest, '{', PAIRED_BRACE);
    if (!closeRun) {
      // Unpaired `{` (e.g. cases) — leave untouched.
      result += tail.slice(0, afterOpen);
      i += afterOpen;
      continue;
    }

    const innerXml = rest.slice(0, closeRun.index);
    result += tail.slice(0, m.index);
    result += buildDelimiterOmml(PAIRED_BRACE.begVal, PAIRED_BRACE.endVal, innerXml);
    i += m.index + m[0].length + closeRun.index + closeRun.length;
  }

  return result;
}

/**
 * Replace plain `{` delimiter run before matrices with stretchy `<m:d>` fences (cases).
 */
function fixOmmlFenceBeforeMatrix(omml: string): string {
  let result = '';
  let i = 0;

  while (i < omml.length) {
    const tail = omml.slice(i);
    const m = FENCE_RUN_BEFORE_MATRIX.exec(tail);
    if (!m) {
      result += tail;
      break;
    }

    const ch = m[1];
    const blockTag = (m[2] || 'm').toLowerCase();
    const pair = DELIMITER_PAIRS[ch];
    if (!pair) {
      result += tail.slice(0, 1);
      i += 1;
      continue;
    }

    const openNeedle = `<m:${blockTag}`;
    const blockOpenRel = tail.indexOf(openNeedle, m.index);
    const blockOpenEnd = tail.indexOf('>', blockOpenRel);
    if (blockOpenEnd === -1) {
      result += tail.slice(0, 1);
      i += 1;
      continue;
    }

    const tagName = `m:${blockTag}`;
    const blockClose = findClosingTag(omml, i + blockOpenEnd + 1, tagName);
    if (blockClose === -1) {
      result += tail.slice(0, 1);
      i += 1;
      continue;
    }

    const blockEnd = blockClose + `</${tagName}>`.length;
    const blockXml = omml.slice(i + blockOpenRel, blockEnd);

    result += tail.slice(0, m.index);
    let patchedMatrixXml = blockXml;
    if (pair.begVal === '{') {
      const eqArr = convertCasesMatrixToEqArr(blockXml);
      patchedMatrixXml = eqArr ?? forceMatrixLeftAlignmentForCases(blockXml);
    }
    result += buildDelimiterOmml(pair.begVal, pair.endVal, patchedMatrixXml);
    let nextI = blockEnd;
    if (pair.endVal) {
      const afterMatrix = omml.slice(nextI);
      const closeRun = findFenceCloseRun(afterMatrix, ch, pair);
      if (closeRun) nextI += closeRun.index + closeRun[0].length;
    }
    i = nextI;
  }

  return result;
}

/**
 * Unpaired left curly brace `\left\{ ... \right.` is emitted as a plain `{` run without a
 * matching closing `}` fence run. If the next sibling is a tall OMML block (eqArr/m/f/rad...),
 * wrap that single block in a stretchy delimiter so `{` grows with its height.
 *
 * Keep this narrow:
 * - Only applies to `{` (not `(` / `[`).
 * - Only when there is NO matching `}` fence run in the remaining string (paired braces are
 *   handled by {@link fixOmmlPairedCurlyBraceDelimiters}).
 * - Only wraps ONE immediate tall sibling (avoids over-wrapping arbitrary spans).
 */
function fixOmmlUnpairedLeftCurlyBeforeTall(omml: string): string {
  let result = '';
  let i = 0;

  while (i < omml.length) {
    const tail = omml.slice(i);
    const m = FENCE_CHAR_RUN.exec(tail);
    if (!m) {
      result += tail;
      break;
    }

    const openCh = m[1];
    if (openCh !== '{') {
      result += tail.slice(0, m.index + m[0].length);
      i += m.index + m[0].length;
      continue;
    }

    const afterOpen = m.index + m[0].length;
    const rest = tail.slice(afterOpen);

    // If there's a matching closing `}` fence run, leave it for the paired-brace pass.
    const closeRun = findMatchingFenceCloseRun(rest, '{', PAIRED_BRACE);
    if (closeRun) {
      result += tail.slice(0, afterOpen);
      i += afterOpen;
      continue;
    }

    const ws = rest.length - rest.trimStart().length;
    const innerStart = i + afterOpen + ws;
    const innerHead = omml.slice(innerStart);
    if (!TALL_OMML_TAG.test(innerHead)) {
      result += tail.slice(0, afterOpen);
      i += afterOpen;
      continue;
    }

    const tagMatch = innerHead.match(/^<(m:\w+)\b/i);
    if (!tagMatch) {
      result += tail.slice(0, afterOpen);
      i += afterOpen;
      continue;
    }

    const tagName = tagMatch[1];
    const openGt = omml.indexOf('>', innerStart);
    if (openGt === -1) {
      result += tail.slice(0, afterOpen);
      i += afterOpen;
      continue;
    }

    const innerClose = findClosingTag(omml, openGt + 1, tagName);
    if (innerClose === -1) {
      result += tail.slice(0, afterOpen);
      i += afterOpen;
      continue;
    }

    const innerEnd = innerClose + `</${tagName}>`.length;
    const innerXml = omml.slice(innerStart, innerEnd);

    result += tail.slice(0, m.index);
    result += buildDelimiterOmml('{', '', innerXml);
    i = innerEnd;
  }

  return result;
}

/**
 * Replace plain delimiter runs with stretchy `<m:d>` fences (cases matrices and `\left/\right`).
 */
export function fixOmmlFenceDelimiterRuns(omml: string): string {
  return stripRedundantFenceRunAfterDelimiter(
    fixOmmlPairedCurlyBraceDelimiters(
      fixOmmlPairedFenceDelimiters(
        fixMergedFencePrefixRuns(
          fixMergedFenceCloseSuffixRuns(
            fixOmmlUnpairedLeftCurlyBeforeTall(fixOmmlFenceBeforeMatrix(omml))
          )
        )
      )
    )
  );
}
