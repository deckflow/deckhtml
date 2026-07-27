import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('DH-P0-011 packaging hygiene', () => {
  it('ships a non-empty MIT LICENSE', () => {
    assert.ok(existsSync(path.join(ROOT, 'LICENSE')), 'LICENSE missing');
    const license = read('LICENSE');
    assert.ok(license.trim().length > 0, 'LICENSE is empty');
    assert.match(license, /MIT/, 'LICENSE is not MIT');
    assert.match(license, /Copyright \(c\)/, 'LICENSE missing copyright line');
  });

  it('ships a valid conversion-report JSON schema', () => {
    const raw = read('schemas/conversion-report.schema.json');
    assert.ok(raw.trim().length > 0, 'schema is empty');
    const schema = JSON.parse(raw);
    assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#');
    assert.equal(schema.type, 'object');
    assert.ok(
      Array.isArray(schema.required) && schema.required.includes('schema_version'),
      'schema must require schema_version',
    );
    // mapping_mode must be defined somewhere in the schema (per-element)
    const serialized = JSON.stringify(schema);
    assert.ok(
      serialized.includes('"mapping_mode"'),
      'schema must define mapping_mode',
    );
    assert.ok(
      /"native"|"vector"|"raster"|"ignored"|"unsupported"/.test(serialized),
      'schema must enumerate mapping_mode values',
    );
  });

  it('ships a valid conversion-result JSON schema', () => {
    const raw = read('schemas/conversion-result.schema.json');
    assert.ok(raw.trim().length > 0, 'schema is empty');
    const schema = JSON.parse(raw);
    assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#');
    assert.equal(schema.type, 'object');
    assert.ok(schema.properties?.pptx || schema.properties?.ok);
  });

  it('README only documents flags that the Commander actually registers', () => {
    const readme = read('README.md');
    const cliSrc = read('src/cli/commands/convert.ts');
    // Extract option names registered via .option('<flag>')
    const registered = new Set<string>();
    const optRe = /\.option\(\s*['"](--[a-z-]+)[ =<]/g;
    let m: RegExpExecArray | null;
    while ((m = optRe.exec(cliSrc)) !== null) {
      registered.add(m[1]);
    }
    // Global flags from cli.ts
    const cliTop = read('src/cli.ts');
    while ((m = optRe.exec(cliTop)) !== null) {
      registered.add(m[1]);
    }
    // Flags mentioned in README reference table (exclude markdown separator rows like | --- |)
    const mentioned = new Set<string>();
    const tableRe = /\|\s*(--[a-z][a-z-]+)\s*\|/g;
    while ((m = tableRe.exec(readme)) !== null) {
      mentioned.add(m[1]);
    }
    const unregistered: string[] = [];
    for (const flag of mentioned) {
      if (!registered.has(flag)) unregistered.push(flag);
    }
    assert.deepEqual(
      unregistered,
      [],
      `README documents flags not registered in Commander: ${unregistered.join(', ')}`,
    );
  });

  it('README programmatic API example matches ConversionOptions type', () => {
    const readme = read('README.md');
    // The README must not show an `output` option on convertHtmlToPptx (library API
    // returns a Buffer; output is a CLI concern).
    const apiBlock = readme.match(/convertHtmlToPptx\(\{[\s\S]*?\}\)/);
    assert.ok(apiBlock, 'README missing convertHtmlToPptx example');
    assert.doesNotMatch(
      apiBlock[0],
      /output\s*:/,
      'README programmatic example must not advertise an `output` option',
    );
  });
});
