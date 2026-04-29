import { describe, it, expect } from 'vitest';
import { EMULATORS, findEmulator } from '../../../assets/editor/src/preview/emulators';
import { applyDarkOverlay } from '../../../assets/editor/src/preview/dark-mode';

describe('emulators', () => {
  it('exposes gmail/outlook/apple_mail', () => {
    expect(EMULATORS.map((e) => e.id).sort()).toEqual(['apple_mail', 'gmail', 'outlook']);
  });
  it('wraps signature html', () => {
    const html = findEmulator('gmail')!.render('<p>SIG</p>', { darkMode: false });
    expect(html).toContain('<p>SIG</p>');
    expect(html).toMatch(/^<!doctype html>/);
  });
  it('preserves outlook MSO comments', () => {
    const html = findEmulator('outlook')!.render('<p>SIG</p>', { darkMode: false });
    expect(html).toContain('<!--[if mso]>');
  });
});

describe('applyDarkOverlay', () => {
  it('injects a media query', () => {
    const out = applyDarkOverlay('<html><head><title>X</title></head></html>');
    expect(out).toContain('prefers-color-scheme: dark');
  });
});
