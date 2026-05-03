import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileSignature } from '@/core/compiler/compile';
import type { SignatureSchema } from '@/core/schema/signature';
import '@/core/blocks';

/**
 * Every JSON file under `templates/` ships in the plugin ZIP and
 * gets seeded by `DefaultTemplatesSeeder` on activation. If a
 * template is malformed (unknown block type, missing required
 * field, broken Container shape) the user picks it from the
 * Template Picker and silently gets a broken signature.
 *
 * This test loads every template file, runs it through the
 * compile pipeline, and asserts the result is non-empty HTML
 * containing the expected outer wrapper. Catches:
 *   - JSON syntax errors (would fail at `JSON.parse`).
 *   - Schema mismatches (compileSignature would push warnings
 *     and produce no chunks).
 *   - Container schema drift (1.0.31's left_children /
 *     right_children must match what `compile` reads).
 */

const TEMPLATES_DIR = resolve(__dirname, '../../../templates');

function loadTemplate(slug: string): SignatureSchema {
  const raw = readFileSync(resolve(TEMPLATES_DIR, `${slug}.json`), 'utf8');
  return JSON.parse(raw) as SignatureSchema;
}

const slugs = readdirSync(TEMPLATES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

describe('shipped templates compile cleanly', () => {
  it.each(slugs)('compiles %s', (slug) => {
    const schema = loadTemplate(slug);
    const result = compileSignature(schema);

    expect(result.html).toContain('<!DOCTYPE html');
    expect(result.html).toContain('</body></html>');
    expect(result.html.length).toBeGreaterThan(200);

    // Compile MUST emit a body for every block in the schema.
    // Warnings from "unknown block type" would slip past length
    // and DOCTYPE checks, so flag them explicitly.
    const unknownTypeWarnings = result.warnings.filter((w) => w.startsWith('Unknown block type'));
    expect(unknownTypeWarnings).toEqual([]);
  });

  it('multi-column templates render BOTH cells', () => {
    // Sanity-check the new 1.0.32 templates render distinct text
    // strings from each cell so an accidental mis-wiring (e.g.
    // compile only emitting `children` and forgetting
    // `right_children`) shows up here.
    const t = loadTemplate('logo-left');
    const html = compileSignature(t).html;
    // Left cell content (logo URL) AND right cell content (heading
    // text) must both appear.
    expect(html).toContain('Logo'); // alt text from the logo image
    expect(html).toContain('Jane Doe'); // heading from the right cell
    expect(html).toContain('jane@acme.com'); // contact_row from the right cell
  });
});
