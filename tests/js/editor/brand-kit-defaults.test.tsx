import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, waitFor } from '@testing-library/react';
import { BRAND_KIT_FONTS, emptyBrandKit, normalizeBrandKit, type BrandKit } from '@shared/brandKit';
import { createEmptySchema, type SignatureSchema } from '@/core/schema/signature';
import { applyBrandKitTypography, newSignatureSchema } from '@/services/brandKitDefaults';
import { useLoadSignature } from '@/hooks/useLoadSignature';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { FontFamilyInput } from '@/editor/sidebar-right/inputs/FontFamilyInput';

const config = (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Record<string, unknown> })
  .IMGSIG_EDITOR_CONFIG;

function kit(typography: Partial<BrandKit['typography']>): BrandKit {
  const k = emptyBrandKit();
  k.typography = { ...k.typography, ...typography };
  return k;
}

const BRAND = kit({
  font_family: 'Georgia, serif',
  text_color: '#222222',
  link_color: '#cc0000',
  accent_color: '#00aa00',
});

describe('applyBrandKitTypography', () => {
  it('applies font, text and link colour to the canvas without mutating the input', () => {
    const empty = createEmptySchema();
    const before = structuredClone(empty);
    const out = applyBrandKitTypography(empty, BRAND);

    expect(out.canvas).toMatchObject({
      font_family: 'Georgia, serif',
      text_color: '#222222',
      link_color: '#cc0000',
    });
    // Everything else stays the empty schema's.
    expect(out.canvas.width).toBe(empty.canvas.width);
    expect(out.canvas.background_color).toBe(empty.canvas.background_color);
    expect(out.blocks).toEqual([]);
    expect(empty).toEqual(before);
  });

  it('ignores invalid values and a missing kit', () => {
    const empty = createEmptySchema();
    const bad = kit({ font_family: 'Comic Sans MS', text_color: 'red', link_color: '#12' });
    expect(applyBrandKitTypography(empty, bad).canvas).toEqual(empty.canvas);
    expect(applyBrandKitTypography(empty, undefined)).toBe(empty);
    expect(newSignatureSchema(null).canvas).toEqual(empty.canvas);
  });

  it('every brand-kit font is one the editor font picker offers', () => {
    const { container } = render(<FontFamilyInput label="Font" value="" onChange={() => {}} />);
    const offered = Array.from(container.querySelectorAll('option')).map((o) => o.value);
    for (const font of BRAND_KIT_FONTS) expect(offered).toContain(font.value);
  });

  it('normalizeBrandKit fills gaps from an older / partial payload', () => {
    const out = normalizeBrandKit({ company: { name: 'Acme', logo_width: 'x' }, social: null });
    expect(out.company.name).toBe('Acme');
    expect(out.company.logo_width).toBe(emptyBrandKit().company.logo_width);
    expect(out.social).toEqual(emptyBrandKit().social);
    expect(normalizeBrandKit('nope')).toEqual(emptyBrandKit());
  });
});

describe('useLoadSignature: brand-kit defaults only for new signatures', () => {
  beforeEach(() => {
    config.brandKit = BRAND;
    useSchemaStore.setState({ schema: createEmptySchema(), hasUserEdited: false });
    usePersistenceStore.setState({ isLoaded: false });
  });

  afterEach(() => {
    config.signatureId = 0;
    delete config.brandKit;
    vi.unstubAllGlobals();
  });

  it('a new signature (id 0) starts with the kit typography and is not marked edited', () => {
    config.signatureId = 0;
    renderHook(() => useLoadSignature());

    const { schema, hasUserEdited } = useSchemaStore.getState();
    expect(schema.canvas.font_family).toBe('Georgia, serif');
    expect(schema.canvas.text_color).toBe('#222222');
    expect(schema.canvas.link_color).toBe('#cc0000');
    expect(hasUserEdited).toBe(false);
    expect(usePersistenceStore.getState().isLoaded).toBe(true);
  });

  it('an existing signature keeps its saved canvas', async () => {
    const saved: SignatureSchema = createEmptySchema();
    saved.canvas = {
      ...saved.canvas,
      font_family: 'Verdana, Geneva, sans-serif',
      text_color: '#333333',
      link_color: '#0000ff',
    };
    config.signatureId = 12;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ id: 12, name: 'Mine', status: 'draft', json_content: saved }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    renderHook(() => useLoadSignature());
    await waitFor(() => expect(usePersistenceStore.getState().isLoaded).toBe(true));

    const { canvas } = useSchemaStore.getState().schema;
    expect(canvas.font_family).toBe('Verdana, Geneva, sans-serif');
    expect(canvas.text_color).toBe('#333333');
    expect(canvas.link_color).toBe('#0000ff');
  });
});
