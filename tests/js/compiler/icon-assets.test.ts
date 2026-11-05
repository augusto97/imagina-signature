import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ICON_SHAPES,
  ICON_TONES,
  getAssetsBaseUrl,
  iconUrl,
  initAssetsBaseUrl,
  setAssetsBaseUrl,
} from '@/core/compiler/assets';
import { ICON_MANIFEST, SOCIAL_NETWORKS, hasIcon } from '@/core/blocks/social-icons/iconSet';
import { CONTACT_ICON, CONTACT_TYPES } from '@/core/blocks/contact-row/normalize';

const ICONS_DIR = resolve(__dirname, '../../../assets/icons');

afterEach(() => setAssetsBaseUrl(null));

describe('icon URL composition', () => {
  it('builds <base>/assets/icons/<shape>-<tone>/<name>.png', () => {
    setAssetsBaseUrl('https://acme.example/wp-content/plugins/imagina-signatures');
    expect(iconUrl('linkedin', 'circle', 'brand')).toBe(
      'https://acme.example/wp-content/plugins/imagina-signatures/assets/icons/circle-brand/linkedin.png',
    );
    expect(iconUrl('email', 'plain', 'light')).toBe(
      'https://acme.example/wp-content/plugins/imagina-signatures/assets/icons/plain-light/email.png',
    );
  });

  it('trims trailing slashes from the base', () => {
    setAssetsBaseUrl('https://acme.example/plugins/imgsig///');
    expect(getAssetsBaseUrl()).toBe('https://acme.example/plugins/imgsig');
    expect(iconUrl('x', 'rounded', 'dark')).toBe(
      'https://acme.example/plugins/imgsig/assets/icons/rounded-dark/x.png',
    );
  });

  it('resolves a relative base against the page', () => {
    setAssetsBaseUrl('/wp-content/plugins/imagina-signatures/');
    expect(getAssetsBaseUrl()).toBe(
      `${window.location.origin}/wp-content/plugins/imagina-signatures`,
    );
  });

  it('falls back to the bootstrap pluginUrl when nothing was set', () => {
    setAssetsBaseUrl(null);
    expect(getAssetsBaseUrl()).toBe('http://localhost/wp-content/plugins/imagina-signatures');
    initAssetsBaseUrl();
    expect(getAssetsBaseUrl()).toBe('http://localhost/wp-content/plugins/imagina-signatures');
  });

  it('never lets bad input into the path', () => {
    setAssetsBaseUrl('https://cdn.example');
    expect(iconUrl('../../wp-config', 'circle', 'brand')).toBe(
      'https://cdn.example/assets/icons/circle-brand/link.png',
    );
    expect(iconUrl('linkedin', 'hexagon' as never, 'neon' as never)).toBe(
      'https://cdn.example/assets/icons/circle-brand/linkedin.png',
    );
  });
});

describe('icon manifest', () => {
  const variants = ICON_SHAPES.flatMap((s) => ICON_TONES.map((t) => `${s}-${t}`));

  it('matches the shapes and tones the compiler knows', () => {
    expect(ICON_MANIFEST.shapes).toEqual([...ICON_SHAPES]);
    expect(ICON_MANIFEST.tones).toEqual([...ICON_TONES]);
    expect(ICON_MANIFEST.size).toBe(96);
  });

  it('offers at least 25 social networks, every one of them described', () => {
    expect(SOCIAL_NETWORKS.length).toBeGreaterThanOrEqual(25);
    for (const name of SOCIAL_NETWORKS) expect(hasIcon(name), name).toBe(true);
  });

  it('has an icon for every contact item type', () => {
    for (const type of CONTACT_TYPES) expect(hasIcon(CONTACT_ICON[type]), type).toBe(true);
    for (const name of ICON_MANIFEST.contact) expect(hasIcon(name), name).toBe(true);
  });

  it('lists every variant for every icon, each a 96×96 PNG on disk under 4 KB', () => {
    for (const [name, entry] of Object.entries(ICON_MANIFEST.icons)) {
      expect(entry.variants.sort(), name).toEqual([...variants].sort());
      expect(entry.color, name).toMatch(/^#[0-9a-f]{6}$/);
      expect(entry.title.length, name).toBeGreaterThan(0);
      for (const variant of variants) {
        const file = resolve(ICONS_DIR, variant, `${name}.png`);
        expect(existsSync(file), `${variant}/${name}.png`).toBe(true);
        const bytes = readFileSync(file);
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect(bytes.readUInt32BE(16), `${variant}/${name}.png width`).toBe(96);
        expect(bytes.readUInt32BE(20), `${variant}/${name}.png height`).toBe(96);
        expect(statSync(file).size, `${variant}/${name}.png size`).toBeLessThanOrEqual(4096);
      }
    }
  });
});
