import { afterEach, describe, expect, it } from 'vitest';
import { _n } from '@shared/i18n';
// @ts-expect-error — plain ESM build script without type declarations.
import { extractFromSource } from '../../../scripts/i18n/extract-js.mjs';

type Host = { IMGSIG_ADMIN_CONFIG?: { translations?: Record<string, string> } };
const host = window as unknown as Host;

afterEach(() => {
  delete host.IMGSIG_ADMIN_CONFIG;
});

describe('_n', () => {
  it('picks the singular for exactly one and the plural otherwise', () => {
    expect(_n('%s person', '%s people', 1, '1')).toBe('1 person');
    expect(_n('%s person', '%s people', 0, '0')).toBe('0 people');
    expect(_n('%s person', '%s people', 5, '5')).toBe('5 people');
  });

  it('formats with the count when no other arguments are given', () => {
    expect(_n('%d user processed.', '%d users processed.', 3)).toBe('3 users processed.');
  });

  it('translates the chosen form', () => {
    host.IMGSIG_ADMIN_CONFIG = {
      translations: { '%s person': '%s persona', '%s people': '%s personas' },
    };
    expect(_n('%s person', '%s people', 1, '1')).toBe('1 persona');
    expect(_n('%s person', '%s people', 2, '2')).toBe('2 personas');
  });
});

describe('extractor', () => {
  it('extracts both literal forms of _n() as msgids', () => {
    const { found, dynamic } = extractFromSource(
      'x.tsx',
      "const a = _n('%s image', '%s images', n, String(n));\nconst b = __('Plain');\n",
    );
    expect(found.map((f: { msgid: string }) => f.msgid)).toEqual([
      '%s image',
      '%s images',
      'Plain',
    ]);
    expect(dynamic).toEqual([]);
  });

  it('reports a non-literal _n() form', () => {
    const { dynamic } = extractFromSource('x.ts', 'const a = _n(one, other, n);\n');
    expect(dynamic).toHaveLength(1);
  });
});
