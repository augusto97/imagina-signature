import { describe, it, expect } from 'vitest';
import { stylesToInline, paddingToCss } from '@/core/compiler/inline-styles';

describe('stylesToInline', () => {
  it('skips undefined / null / empty values', () => {
    expect(
      stylesToInline({ color: '#000', background: undefined, fontWeight: null, padding: '' }),
    ).toBe('color:#000');
  });

  it('kebab-cases camelCase keys', () => {
    expect(stylesToInline({ fontFamily: 'Arial', lineHeight: 1.4 })).toBe(
      'font-family:Arial;line-height:1.4',
    );
  });
});

describe('paddingToCss', () => {
  it('returns 0 when no padding is provided', () => {
    expect(paddingToCss(undefined)).toBe('0');
  });

  it('formats top right bottom left', () => {
    expect(paddingToCss({ top: 1, right: 2, bottom: 3, left: 4 })).toBe('1px 2px 3px 4px');
  });
});
