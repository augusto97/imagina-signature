import { isBrandKitColor, isBrandKitFont, type BrandKit } from '@shared/brandKit';
import { getConfig } from '@/bridge/apiClient';
import { createEmptySchema, type SignatureSchema } from '@/core/schema/signature';

/**
 * Company brand-kit defaults for NEW signatures.
 *
 * A signature that doesn't exist yet (`signatureId === 0`) starts from
 * the empty schema with the kit's typography on its canvas — font
 * family, text colour, link colour — so every employee's signature
 * opens on-brand. Existing signatures are never touched: their canvas
 * is whatever they saved.
 *
 * Each value is applied only when valid (web-safe font, `#rgb` /
 * `#rrggbb`); anything else keeps the empty schema's default.
 */
export function applyBrandKitTypography(
  schema: SignatureSchema,
  kit: BrandKit | null | undefined,
): SignatureSchema {
  const typography = kit?.typography;
  if (!typography) return schema;

  const canvas = { ...schema.canvas };
  if (typeof typography.font_family === 'string' && isBrandKitFont(typography.font_family)) {
    canvas.font_family = typography.font_family;
  }
  if (typeof typography.text_color === 'string' && isBrandKitColor(typography.text_color)) {
    canvas.text_color = typography.text_color;
  }
  if (typeof typography.link_color === 'string' && isBrandKitColor(typography.link_color)) {
    canvas.link_color = typography.link_color;
  }
  return { ...schema, canvas };
}

/** The bootstrap's brand kit, or null outside the editor host. */
export function configBrandKit(): BrandKit | null {
  try {
    return getConfig().brandKit ?? null;
  } catch {
    return null;
  }
}

/** Schema a brand-new signature starts from. */
export function newSignatureSchema(kit: BrandKit | null = configBrandKit()): SignatureSchema {
  return applyBrandKitTypography(createEmptySchema(), kit);
}
