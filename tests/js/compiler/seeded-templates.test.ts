import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import {
  appliedTemplate,
  installMockSite,
  templateSlugs as slugs,
} from '../fixtures/templateLibrary';
import '@/core/blocks';

/**
 * Every JSON file under `templates/` ships in the plugin ZIP and
 * gets seeded by `DefaultTemplatesSeeder` on activation (the stricter
 * design gate lives in `tests/js/templates/library.test.ts`). If a
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

// Templates reference the profile / brand kit (`{{wp_*}}`, `{{company_*}}`)
// and `{{imgsig_assets_url}}`: compile them against a mock site.
let restore: () => void = () => {};
beforeAll(() => {
  restore = installMockSite();
});
afterAll(() => restore());

describe('shipped templates compile cleanly', () => {
  it.each(slugs)('compiles %s', (slug) => {
    const schema = appliedTemplate(slug);
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

  it('multi-column templates render EVERY cell', () => {
    // Distinct content from each column must reach the output, so a
    // mis-wired container (a column compiled and another dropped)
    // shows up here.
    const html = compileSignature(appliedTemplate('real-estate-agent')).html;
    expect(html).toContain('templates/avatar-3.png'); // column 1: photo
    expect(html).toContain('Lucía Fernández'); // column 2: name
    expect(html).toContain('lucia.fernandez@northwind.es'); // column 2: contact
    expect(html).toContain('templates/qr-sample.png'); // column 3: hosted QR
    expect(html).toContain('Ver inmuebles'); // column 3: QR caption
  });
});
