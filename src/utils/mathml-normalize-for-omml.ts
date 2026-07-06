/**
 * KaTeX wraps content in <semantics> (annotation stripped elsewhere). mathml2omml
 * logs "Type not supported" for semantics/annotation; unwrap to the visible row.
 */
export function unwrapMathMlSemantics(mathml: string): string {
  return mathml.replace(
    /<semantics>\s*([\s\S]*?)\s*<\/semantics>/gi,
    (_match, inner: string) => inner.replace(/<annotation\b[\s\S]*?<\/annotation>/gi, '').trim()
  );
}

/** KaTeX differential operators as <mi mathvariant="normal"> — use <mo> for correct PPT glyphs. */
const KATEX_OPERATOR_MI_TO_MO = new Set(['∇', '∂']);

/**
 * KaTeX emits `\nabla` / `\partial` as `<mi mathvariant="normal">`. mathml2omml then
 * attaches `m:sty m:val="undefined"` and PowerPoint may render U+2207 as italic 𝛻 (U+1D6FB).
 */
export function normalizeKatexOperatorMiToMo(mathml: string): string {
  return mathml.replace(
    /<mi\b[^>]*\bmathvariant="normal"[^>]*>([^<]+)<\/mi>/gi,
    (full, ch: string) => {
      const t = ch.trim();
      return KATEX_OPERATOR_MI_TO_MO.has(t) ? `<mo>${t}</mo>` : full;
    }
  );
}

/**
 * mathml2omml leaves n-ary integrals with an empty <m:e/> when MathJax emits
 * <msubsup><mo>∫</mo>...</msubsup><msup>...</msup>... (siblings) instead of
 * wrapping the integrand in <mrow>. PowerPoint then omits or misplaces the
 * integrand. Group those siblings into <mrow> before conversion.
 */

/** N-ary operators KaTeX/MathJax may put first in msub / msubsup (∫, ∑, ∏, …). */
const NARY_FIRST_MO =
  /^[\s\uFEFF]*[∫∬∭∮∯∰∱∲∳∑∏⋂⋃⨀⨁⨂⋁⋀]\s*$/;

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

/** Start index of `<mo...>...</mo>` whose text is exactly `=` (equation RHS). */
function findRelationEqualsMo(s: string, from: number): number {
  let pos = from;
  while (pos < s.length) {
    const moStart = s.indexOf('<mo', pos);
    if (moStart === -1) return -1;
    const gt = s.indexOf('>', moStart);
    if (gt === -1) return -1;
    const close = s.indexOf('</mo>', gt);
    if (close === -1) return -1;
    const inner = s.slice(gt + 1, close);
    const text = inner.replace(/&#x0*3D;/gi, '=').replace(/&#61;/g, '=').trim();
    if (text === '=') return moStart;
    pos = moStart + 3;
  }
  return -1;
}

/** Close KaTeX-style `<mstyle><mrow>` wrappers left open after splitting at `=`. */
function closeOpenMtableCellWrappers(part: string): string {
  let out = part;
  if (/<mrow\b/i.test(out) && !/<\/mrow>/i.test(out)) out += '</mrow>';
  if (/<mstyle\b/i.test(out) && !/<\/mstyle>/i.test(out)) out += '</mstyle>';
  return out;
}

/** Re-open wrappers from the original cell for the RHS column after `=`. */
function openMtableCellWrappersFrom(cellInner: string): string {
  let prefix = '';
  const mstyle = cellInner.match(/<mstyle\b[^>]*>/i);
  const mrow = cellInner.match(/<mrow\b[^>]*>/i);
  if (mstyle) prefix += mstyle[0];
  if (mrow) prefix += mrow[0];
  return prefix;
}

/**
 * Split a single `<mtd>` row at relation `=` into LHS | `=` RHS columns so PPT aligns equals.
 * KaTeX `\begin{cases}` often emits one `<mtd>` per row with the full equation inline.
 */
function splitMtrAtRelationEquals(mtrInner: string): string | null {
  if ((mtrInner.match(/<mtd\b/gi)?.length ?? 0) !== 1) return null;
  const mtdMatch = mtrInner.match(/^\s*(<mtd\b[^>]*>)([\s\S]*?)<\/mtd>\s*$/i);
  if (!mtdMatch) return null;

  const mtdOpen = mtdMatch[1];
  const cellInner = mtdMatch[2];
  const eqStart = findRelationEqualsMo(cellInner, 0);
  if (eqStart === -1) return null;
  if (findRelationEqualsMo(cellInner, eqStart + 3) !== -1) return null;

  const lhsPart = cellInner.slice(0, eqStart);
  const rhsPart = cellInner.slice(eqStart);
  if (!lhsPart.trim() || !rhsPart.trim()) return null;

  const lhsCell = closeOpenMtableCellWrappers(lhsPart);
  const rhsCell = openMtableCellWrappersFrom(cellInner) + rhsPart;
  return `${mtdOpen}${lhsCell}</mtd>${mtdOpen}${rhsCell}</mtd>`;
}

/**
 * When every row of an `<mtable>` is a single cell containing `lhs = rhs`, split into two
 * columns (`columnalign="right left"`) so mathml2omml emits an OMML matrix with aligned `=`.
 */
export function splitSingleColumnMtableRowsAtEquals(mathml: string): string {
  return mathml.replace(
    /(<mtable\b)([^>]*>)([\s\S]*?)(<\/mtable>)/gi,
    (full, openTag: string, attrs: string, inner: string, closeTag: string) => {
      const rowMatches = [...inner.matchAll(/(<mtr\b[^>]*>)([\s\S]*?)(<\/mtr>)/gi)];
      if (!rowMatches.length) return full;

      const splitRows: string[] = [];
      for (const row of rowMatches) {
        const split = splitMtrAtRelationEquals(row[2]);
        if (!split) return full;
        splitRows.push(`${row[1]}${split}${row[3]}`);
      }

      let newAttrs = attrs;
      if (/columnalign\s*=/i.test(newAttrs)) {
        newAttrs = newAttrs.replace(/columnalign\s*=\s*"[^"]*"/i, 'columnalign="right left"');
      } else {
        newAttrs = `${newAttrs} columnalign="right left"`;
      }

      return `${openTag}${newAttrs}>${splitRows.join('')}${closeTag}`;
    }
  );
}

/**
 * KaTeX emits `\int_{\Theta} …` as `<msub><mo>∫</mo><mi>Θ</mi></msub>` followed by
 * the integrand as sibling nodes inside the same `<mrow>`. mathml2omml only puts the
 * first token into `<m:nary><m:e>`, leaving `p(D|ϑ)…` outside the integral — corrupt
 * OMML that triggers PowerPoint "repair document". Wrap those siblings in `<mrow>`.
 */
function wrapMsubIntegralIntegrandInMrow(mathml: string): string {
  let i = 0;
  let out = '';
  const openTagRe = /<msub\b[^>]*>/gi;

  while (i < mathml.length) {
    openTagRe.lastIndex = i;
    const m = openTagRe.exec(mathml);
    if (!m) {
      out += mathml.slice(i);
      break;
    }
    const openStart = m.index;
    const openEnd = openStart + m[0].length;
    out += mathml.slice(i, openStart);

    const innerClose = findClosingTag(mathml, openEnd, 'msub');
    if (innerClose === -1) {
      out += mathml.slice(openStart);
      break;
    }
    const inner = mathml.slice(openEnd, innerClose);
    const firstMo = inner.match(/^\s*<mo\b[^>]*>([\s\S]*?)<\/mo>/i);
    const moText = firstMo ? firstMo[1].trim() : '';
    const afterBlock = innerClose + '</msub>'.length;

    let j = afterBlock;
    while (j < mathml.length && /\s/.test(mathml[j])) j++;

    const isNaryHead = moText.length > 0 && NARY_FIRST_MO.test(moText);
    if (!isNaryHead || mathml.slice(j, j + 6) === '<mrow>') {
      out += mathml.slice(openStart, afterBlock);
      i = afterBlock;
      continue;
    }

    const mrowStart = mathml.lastIndexOf('<mrow>', openStart);
    if (mrowStart === -1) {
      out += mathml.slice(openStart, afterBlock);
      i = afterBlock;
      continue;
    }
    const mrowContentStart = mrowStart + '<mrow>'.length;
    const mrowClose = findClosingTag(mathml, mrowContentStart, 'mrow');
    if (mrowClose === -1 || mrowClose <= afterBlock) {
      out += mathml.slice(openStart, afterBlock);
      i = afterBlock;
      continue;
    }

    const integrand = mathml.slice(j, mrowClose);
    if (!integrand.trim()) {
      out += mathml.slice(openStart, afterBlock);
      i = afterBlock;
      continue;
    }

    out +=
      mathml.slice(openStart, afterBlock) + '<mrow>' + integrand + '</mrow>';
    i = mrowClose;
  }

  return out;
}

/**
 * If `<msubsup>` begins with an integral mo and is followed by a non-mrow
 * integrand, wrap siblings up to (but not including) a top-level `<mo>=</mo>`.
 */
function normalizeMathMlMsubsupIntegralIntegrand(mathml: string): string {
  let i = 0;
  let out = '';
  const openTagRe = /<msubsup\b[^>]*>/gi;

  while (i < mathml.length) {
    openTagRe.lastIndex = i;
    const m = openTagRe.exec(mathml);
    if (!m) {
      out += mathml.slice(i);
      break;
    }
    const openStart = m.index;
    const openEnd = openStart + m[0].length;
    out += mathml.slice(i, openStart);

    const innerClose = findClosingTag(mathml, openEnd, 'msubsup');
    if (innerClose === -1) {
      out += mathml.slice(openStart);
      break;
    }
    const inner = mathml.slice(openEnd, innerClose);
    const firstMo = inner.match(/^\s*<mo\b[^>]*>([\s\S]*?)<\/mo>/i);
    const moText = firstMo ? firstMo[1].trim() : '';
    const afterBlock = innerClose + '</msubsup>'.length;

    let j = afterBlock;
    while (j < mathml.length && /\s/.test(mathml[j])) j++;

    const alreadyRow = mathml.slice(j, j + 6) === '<mrow>';
    const isNaryHead = moText.length > 0 && NARY_FIRST_MO.test(moText);

    if (!isNaryHead || alreadyRow) {
      out += mathml.slice(openStart, afterBlock);
      i = afterBlock;
      continue;
    }

    const eqMo = findRelationEqualsMo(mathml, j);
    if (eqMo === -1) {
      out += mathml.slice(openStart, afterBlock);
      i = afterBlock;
      continue;
    }

    const integrand = mathml.slice(j, eqMo);
    out +=
      mathml.slice(openStart, afterBlock) +
      '<mrow>' +
      integrand +
      '</mrow>';
    i = eqMo;
  }

  return out;
}

/**
 * KaTeX `\left[` / `\right]` emit `<mo fence="true">[</mo>`. When the next sibling is
 * `<mo>−</mo>`, mathml2omml merges them into one run (`[−`) and PowerPoint renders a
 * non-stretchy bracket. A zero-width `<mspace/>` keeps the fence in its own run.
 */
// Keep this normalization narrowly scoped: we only need it to prevent mathml2omml from
// merging `[` with the next token (e.g. `[−`) or merging the closing `]` into prior text.
// Applying it to `(` / `)` has caused invalid OMML in some inputs (PowerPoint "repair").
const FENCE_OPEN_MO = /<mo\b[^>]*\bfence\s*=\s*["']?true["']?[^>]*>\[<\/mo>/i;
const FENCE_CLOSE_MO = /<mo\b[^>]*\bfence\s*=\s*["']?true["']?[^>]*>\]<\/mo>/i;

/** MathJax `\left[` / `\right]` → `<mo data-mjx-texclass="OPEN|CLOSE">` (no fence="true"). */
const MJX_OPEN_BRACKET_MO =
  /<mo\b[^>]*\bdata-mjx-texclass\s*=\s*["']?OPEN["']?[^>]*>\[<\/mo>/i;
const MJX_CLOSE_BRACKET_MO =
  /<mo\b[^>]*\bdata-mjx-texclass\s*=\s*["']?CLOSE["']?[^>]*>\]<\/mo>/i;
const MJX_OPEN_BRACE_MO =
  /<mo\b[^>]*\bdata-mjx-texclass\s*=\s*["']?OPEN["']?[^>]*>\{<\/mo>/i;
const MJX_CLOSE_BRACE_MO =
  /<mo\b[^>]*\bdata-mjx-texclass\s*=\s*["']?CLOSE["']?[^>]*>\}<\/mo>/i;

export function normalizeFenceMoDelimitersForOmml(mathml: string): string {
  let out = mathml.replace(
    new RegExp(`(${FENCE_OPEN_MO.source})(\\s*)(?=<mo\\b)`, 'gi'),
    '$1<mspace width="0em"/>$2'
  );
  // MathJax `\left[ … \right]` — same run-merging issue as KaTeX fence mo.
  out = out.replace(
    new RegExp(`(${MJX_OPEN_BRACKET_MO.source})(\\s*)(?=<)`, 'gi'),
    '$1<mspace width="0em"/>$2'
  );
  // MathJax `\left\{ … \right\}` — keep `{` / `}` in their own runs.
  out = out.replace(
    new RegExp(`(${MJX_OPEN_BRACE_MO.source})(\\s*)(?=<)`, 'gi'),
    '$1<mspace width="0em"/>$2'
  );
  // KaTeX `\left( -\frac{…}{…} \right)` → `<mo>(</mo><mo>−</mo>…`; mathml2omml merges to `(−`.
  out = out.replace(
    /(<mo\b[^>]*>\(<\/mo>)(\s*)(?=<mo\b)/gi,
    '$1<mspace width="0em"/>$2'
  );
  // Keep closing `]` / `)` in their own run (e.g. `,t)` + `]` → not `,t)]`).
  out = out.replace(
    new RegExp(`(<\\/mo>)(\\s*)(${FENCE_CLOSE_MO.source})`, 'gi'),
    '$1<mspace width="0em"/>$2$3'
  );
  out = out.replace(
    new RegExp(
      `(<\\/(?:mo|mi|mn|mrow|mfrac|msup|msub|msubsup|mstyle|mspace)>)(\\s*)(${MJX_CLOSE_BRACKET_MO.source})`,
      'gi'
    ),
    '$1<mspace width="0em"/>$2$3'
  );
  out = out.replace(
    new RegExp(
      `(<\\/(?:mo|mi|mn|mrow|mfrac|msup|msub|msubsup|mstyle|mspace)>)(\\s*)(${MJX_CLOSE_BRACE_MO.source})`,
      'gi'
    ),
    '$1<mspace width="0em"/>$2$3'
  );
  return out;
}

/**
 * MathJax often represents accents like \dot{r} using `<mover>` with a dot `<mo>˙</mo>`.
 * Without `accent="true"`, downstream conversion may produce OMML that PowerPoint renders
 * as a normal overset/under marker (observed as "dot under r" in PPTX).
 *
 * Keep this narrowly scoped to dot accents emitted by MathJax/KaTeX.
 */
export function normalizeMoverDotAccentForOmml(mathml: string): string {
  return mathml.replace(/<mover\b([^>]*)>([\s\S]*?)<\/mover>/gi, (full, attrs: string, inner: string) => {
    if (/\baccent\s*=/.test(attrs)) return full;

    // Only apply when the overscript is a dot-like mo.
    // MathJax tends to emit U+02D9 (˙); sometimes plain '.' or HTML entities appear.
    const hasDotOverscript =
      /<mo\b[^>]*>\s*(?:˙|\.|·|&#x0*2D9;|&#x0*307;|&#x0*B7;|&middot;)\s*<\/mo>/i.test(inner) ||
      /<mo\b[^>]*>\s*(?:&#729;|&#775;)\s*<\/mo>/i.test(inner); // decimal entities: 729=˙, 775=̇

    if (!hasDotOverscript) return full;

    // Normalize "middle dot" into "dot above" for accents.
    // `·` (U+00B7, &middot;, &#xB7;) is a punctuation dot and mathml2omml tends to emit limUpp,
    // which PowerPoint can render like a normal overset symbol rather than an accent.
    // Use U+02D9 (˙) so mathml2omml emits an actual OMML accent (<m:acc>).
    const normalizedInner = inner.replace(
      /(<mo\b[^>]*>\s*)(?:·|&middot;|&#x0*B7;)\s*(<\/mo>)/gi,
      `$1˙$2`
    );

    // Add accent="true" on mover.
    return `<mover${attrs} accent="true">${normalizedInner}</mover>`;
  });
}

/**
 * Aligned/tabular MathML may emit `<mo>&</mo>` or `<malignmark/>` as column alignment
 * markers inside `<mtable>`. mathml2omml passes them through as a visible "&".
 */
export function stripMathMlTableAlignmentMarkers(mathml: string): string {
  return mathml.replace(
    /(<mtable\b[^>]*>)([\s\S]*?)(<\/mtable>)/gi,
    (_full, open: string, inner: string, close: string) =>
      open +
      inner
        .replace(/<mo\b[^>]*>\s*(?:&amp;|&)\s*<\/mo>/gi, '')
        .replace(/<malignmark\b[^>]*\/?>/gi, '') +
      close
  );
}

/**
 * Normalize MathML before mathml2omml so n-ary integrals keep a single integrand.
 */
export function normalizeMathMlNaryIntegrandForOmml(mathml: string): string {
  return normalizeMoverDotAccentForOmml(
    normalizeFenceMoDelimitersForOmml(
      normalizeMathMlMsubsupIntegralIntegrand(
        wrapMsubIntegralIntegrandInMrow(
          stripMathMlTableAlignmentMarkers(
            splitSingleColumnMtableRowsAtEquals(normalizeKatexOperatorMiToMo(mathml))
          )
        )
      )
    )
  );
}
