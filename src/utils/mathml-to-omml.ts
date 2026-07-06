/**
 * Convert MathML to Office Math Markup Language (OMML) via mathml2omml (LGPL-3.0).
 */

export type MathmlToOmmlResult =
  | { ok: true; omml: string }
  | { ok: false; error: string };

import {
  normalizeMathMlNaryIntegrandForOmml,
  unwrapMathMlSemantics,
} from './mathml-normalize-for-omml';
import { fixOmmlFenceDelimiterRuns } from './omml-fence-delimiter';

type Mml2OmmlFn = (mathml: string, options?: { disableDecode?: boolean }) => string;

let mml2ommlLoader: Promise<Mml2OmmlFn> | null = null;

function loadMml2Omml(): Promise<Mml2OmmlFn> {
  if (!mml2ommlLoader) {
    mml2ommlLoader = import('mathml2omml').then((mod) => mod.mml2omml);
  }
  return mml2ommlLoader;
}

/**
 * Convert a MathML string (typically full `<math>…</math>`) to OMML (`<m:oMath>…</m:oMath>`).
 */
export async function convertMathmlToOmml(mathml: string): Promise<MathmlToOmmlResult> {
  const trimmed = mathml?.trim();
  if (!trimmed) {
    return { ok: false, error: 'Empty MathML' };
  }
  try {
    const mml2omml = await loadMml2Omml();
    const normalized = normalizeMathMlNaryIntegrandForOmml(unwrapMathMlSemantics(trimmed));
    const rawOmml = mml2omml(normalized);
    const omml = fixOmmlFenceDelimiterRuns(rawOmml);
    if (!omml || !/<m:oMath\b/i.test(omml)) {
      return { ok: false, error: 'Converter did not produce m:oMath' };
    }
    return { ok: true, omml };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
