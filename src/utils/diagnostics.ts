/**
 * Structured conversion diagnostics (DH-P0-009).
 *
 * A Diagnostic is the stable, machine-readable form of every issue deckhtml
 * surfaces during a conversion. rule_id stays semantically stable across patch
 * versions so callers can branch on it.
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  rule_id: string;
  severity: DiagnosticSeverity;
  /** Slide id or 1-based index, when applicable. */
  slide_id?: string | null;
  /** Caller-declared element identity, when applicable. */
  element_id?: string | null;
  message: string;
  /** Suggested remediation. */
  recovery?: string | null;
}

/** Minimum rule families deckhtml guarantees (DH-P0-009). */
export const RULE_IDS = {
  IDENTITY_MISSING: 'DECKHTML_IDENTITY_MISSING',
  IDENTITY_DUPLICATE: 'DECKHTML_IDENTITY_DUPLICATE',
  IDENTITY_NOT_EXPORTED: 'DECKHTML_IDENTITY_NOT_EXPORTED',
  KIND_AMBIGUOUS: 'DECKHTML_KIND_AMBIGUOUS',
  KIND_UNSUPPORTED: 'DECKHTML_KIND_UNSUPPORTED',
  STYLE_UNSUPPORTED: 'DECKHTML_STYLE_UNSUPPORTED',
  RESOURCE_REMOTE_BLOCKED: 'DECKHTML_REMOTE_RESOURCE_BLOCKED',
  RESOURCE_MISSING: 'DECKHTML_RESOURCE_MISSING',
  RESOURCE_ESCAPED: 'DECKHTML_RESOURCE_ESCAPED',
  BROWSER_UNAVAILABLE: 'DECKHTML_BROWSER_UNAVAILABLE',
  BROWSER_CRASHED: 'DECKHTML_BROWSER_CRASHED',
  BROWSER_TIMEOUT: 'DECKHTML_BROWSER_TIMEOUT',
  FONT_MISSING: 'DECKHTML_FONT_MISSING',
  FONT_FALLBACK: 'DECKHTML_FONT_FALLBACK',
  RASTER_FALLBACK: 'DECKHTML_RASTER_FALLBACK',
  GEOMETRY_INVALID: 'DECKHTML_GEOMETRY_INVALID',
  GEOMETRY_UNSTABLE: 'DECKHTML_GEOMETRY_UNSTABLE',
  OOXML_WRITE_FAILURE: 'DECKHTML_OOXML_WRITE_FAILURE',
  OOXML_REOPEN_FAILURE: 'DECKHTML_OOXML_REOPEN_FAILURE',
  MAPPING_CLOSURE_FAILURE: 'DECKHTML_MAPPING_CLOSURE_FAILURE',
  OUTPUT_EXISTS: 'DECKHTML_OUTPUT_EXISTS',
} as const;

/**
 * Error thrown for hard failures. Carries a primary Diagnostic plus optional
 * additional diagnostics so callers can still harvest structured info from a
 * thrown ConversionError.
 */
export class ConversionError extends Error {
  readonly primary: Diagnostic;
  readonly diagnostics: Diagnostic[];

  constructor(primary: Diagnostic, additional: Diagnostic[] = []) {
    super(primary.message);
    this.name = 'ConversionError';
    this.primary = primary;
    this.diagnostics = [primary, ...additional];
  }

  /** True when at least one diagnostic is severity 'error'. */
  get hasErrors(): boolean {
    return this.diagnostics.some((d) => d.severity === 'error');
  }
}

/**
 * Mutable collector that dedupes diagnostics by (rule_id, element_id, message)
 * and exposes helpers to push standard families. Keeps api.ts terse.
 */
export class DiagnosticsCollector {
  private readonly items: Diagnostic[] = [];
  private readonly seen = new Set<string>();

  private key(d: Diagnostic): string {
    return `${d.rule_id}|${d.element_id ?? ''}|${d.slide_id ?? ''}|${d.message}`;
  }

  push(d: Diagnostic): void {
    const k = this.key(d);
    if (this.seen.has(k)) return;
    this.seen.add(k);
    this.items.push(d);
  }

  pushMany(ds: Diagnostic[]): void {
    for (const d of ds) this.push(d);
  }

  add(ruleId: string, severity: DiagnosticSeverity, message: string, opts: Partial<Diagnostic> = {}): void {
    this.push({ rule_id: ruleId, severity, message, ...opts });
  }

  list(): readonly Diagnostic[] {
    return this.items;
  }

  get count(): number {
    return this.items.length;
  }

  get errorCount(): number {
    return this.items.filter((d) => d.severity === 'error').length;
  }

  get warningCount(): number {
    return this.items.filter((d) => d.severity === 'warning').length;
  }

  get infoCount(): number {
    return this.items.filter((d) => d.severity === 'info').length;
  }

  toJSON(): Diagnostic[] {
    return this.items.slice();
  }
}
