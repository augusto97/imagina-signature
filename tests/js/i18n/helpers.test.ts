import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __ as editorTranslate } from '@/i18n/helpers';
import { getTranslations as editorGetTranslations } from '@/i18n/translations';
import { __ as adminTranslate } from '@admin/i18n';
import { sprintf, translate } from '@shared/i18n';

type Win = Window & {
  IMGSIG_EDITOR_CONFIG?: { translations?: unknown };
  IMGSIG_ADMIN_CONFIG?: { translations?: unknown };
};

const win = window as unknown as Win;

function clearConfigs(): void {
  delete win.IMGSIG_EDITOR_CONFIG;
  delete win.IMGSIG_ADMIN_CONFIG;
}

describe('sprintf', () => {
  it('substitutes sequential %s in order', () => {
    expect(sprintf('%s of %s', 'a', 'b')).toBe('a of b');
  });

  it('supports positional %1$s / %2$s, including reordering', () => {
    expect(sprintf('%2$s, %1$s', 'Ada', 'Lovelace')).toBe('Lovelace, Ada');
    expect(sprintf('%1$s and %1$s again', 'x')).toBe('x and x again');
  });

  it('keeps sequential and positional counters independent', () => {
    expect(sprintf('%2$s %s %s', 'a', 'b')).toBe('b a b');
  });

  it('formats %d as an integer', () => {
    expect(sprintf('%d KB', 12.7)).toBe('12 KB');
    expect(sprintf('%1$d items', '3')).toBe('3 items');
    expect(sprintf('%d', 'abc')).toBe('0');
  });

  it('turns %% into a literal percent sign', () => {
    expect(sprintf('%s%% done', 50)).toBe('50% done');
  });

  it('renders a missing argument as an empty string', () => {
    expect(sprintf('%s and %s', 'one')).toBe('one and ');
    expect(sprintf('%3$s!', 'a')).toBe('!');
  });

  it('leaves unknown conversions alone', () => {
    expect(sprintf('100%x %s', 'y')).toBe('100%x y');
  });
});

describe('translate', () => {
  it('returns the mapped string or the msgid', () => {
    expect(translate({ Save: 'Guardar' }, 'Save')).toBe('Guardar');
    expect(translate({ Save: 'Guardar' }, 'Cancel')).toBe('Cancel');
  });

  it('ignores empty translations and prototype members', () => {
    expect(translate({ Save: '' }, 'Save')).toBe('Save');
    expect(translate({}, 'constructor')).toBe('constructor');
    expect(translate({}, 'toString')).toBe('toString');
  });
});

describe('editor __()', () => {
  beforeEach(clearConfigs);
  afterEach(clearConfigs);

  it('falls back to the msgid when no config / translations exist', () => {
    expect(editorTranslate('My Signatures')).toBe('My Signatures');
    win.IMGSIG_EDITOR_CONFIG = {};
    expect(editorTranslate('My Signatures')).toBe('My Signatures');
  });

  it('reads IMGSIG_EDITOR_CONFIG.translations', () => {
    win.IMGSIG_EDITOR_CONFIG = { translations: { 'My Signatures': 'Mis firmas' } };
    expect(editorTranslate('My Signatures')).toBe('Mis firmas');
    expect(editorTranslate('Untranslated')).toBe('Untranslated');
    expect(editorGetTranslations()).toEqual({ 'My Signatures': 'Mis firmas' });
  });

  it('substitutes placeholders in the translated string', () => {
    win.IMGSIG_EDITOR_CONFIG = {
      translations: {
        'Created on %s': 'Creada el %s',
        '%1$s of %2$s': '%2$s: %1$s',
      },
    };
    expect(editorTranslate('Created on %s', '2026-11-05')).toBe('Creada el 2026-11-05');
    expect(editorTranslate('%1$s of %2$s', 3, 10)).toBe('10: 3');
  });

  it('returns strings verbatim when called without arguments', () => {
    win.IMGSIG_EDITOR_CONFIG = { translations: { 'Width (%)': 'Ancho (%)' } };
    expect(editorTranslate('Width (%)')).toBe('Ancho (%)');
    expect(editorTranslate('100%% literal')).toBe('100%% literal');
  });

  it('treats a PHP-encoded empty array as "no translations"', () => {
    win.IMGSIG_EDITOR_CONFIG = { translations: [] };
    expect(editorTranslate('length')).toBe('length');
  });
});

describe('admin __()', () => {
  beforeEach(clearConfigs);
  afterEach(clearConfigs);

  it('reads IMGSIG_ADMIN_CONFIG.translations', () => {
    win.IMGSIG_ADMIN_CONFIG = { translations: { Templates: 'Plantillas' } };
    expect(adminTranslate('Templates')).toBe('Plantillas');
    expect(adminTranslate('Settings')).toBe('Settings');
  });

  it('supports %s and positional placeholders', () => {
    win.IMGSIG_ADMIN_CONFIG = {
      translations: { 'Apply “%s” in bulk': 'Aplicar «%s» en bloque' },
    };
    expect(adminTranslate('Apply “%s” in bulk', 'Legal')).toBe('Aplicar «Legal» en bloque');
    expect(adminTranslate('%2$s / %1$s', 'a', 'b')).toBe('b / a');
  });
});
