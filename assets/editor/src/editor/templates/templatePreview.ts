import type { Block, QrCodeBlock, VCardBlock } from '@/core/schema/blocks';
import type { SignatureSchema } from '@/core/schema/signature';
import { mapChildren } from '@/core/schema/tree';
import { migrateSchema, schemaNeedsMigration } from '@/core/schema/migrate';
import { qrContentHash } from '@/core/blocks/qr-code/definition';
import { vcardContentHash } from '@/core/blocks/vcard/definition';
import { compileSignature } from '@/core/compiler/compile';
import { resolvedVariables, systemVariables } from '@/core/compiler/variables';
import { __ } from '@/i18n/helpers';

/**
 * Previews of a template BEFORE it is applied (template picker cards,
 * the onboarding's live preview).
 *
 * A template references the employee's profile (`{{wp_*}}`) and the
 * company brand kit (`{{company_*}}`). On a fresh site the brand kit is
 * often still blank, which would show cards without a logo or company
 * name — so blank system values are filled with neutral samples for the
 * preview only. Nothing here is ever saved: applying a template keeps
 * the real tokens, and the canvas shows the real values.
 *
 * QR codes and vCards only reach the export once the editor has
 * uploaded their hosted file (right after the template is applied), so
 * previews point them at a sample QR image / an inert link.
 */

/** Base URL of the plugin's `assets/` folder (the `imgsig_assets_url` system variable). */
export function assetsUrl(system: Record<string, string> = systemVariables()): string {
  return (system.imgsig_assets_url ?? '').replace(/\/+$/, '');
}

/** Neutral sample values for blank system variables, keyed like the system variables. */
export function sampleSystemValues(base: string = assetsUrl()): Record<string, string> {
  const samples: Record<string, string> = {
    wp_display_name: __('Alex Morgan'),
    wp_email: 'alex@example.com',
    company_name: 'Northwind',
    company_tagline: __('Digital solutions for growing companies'),
    company_website: 'https://www.example.com',
    company_phone: '+34 910 000 100',
    company_email: 'hello@example.com',
    company_address: __('123 Main Street, Madrid'),
    company_linkedin: 'https://www.linkedin.com/',
    company_x: 'https://x.com/',
    company_facebook: 'https://www.facebook.com/',
    company_instagram: 'https://www.instagram.com/',
    company_youtube: 'https://www.youtube.com/',
    company_tiktok: 'https://www.tiktok.com/',
    company_github: 'https://github.com/',
    company_whatsapp: 'https://wa.me/34600000100',
  };
  if (base !== '') samples.company_logo = `${base}/templates/logo-1.png`;
  return samples;
}

/**
 * System variables for a preview: the real ones, with blank values
 * replaced by {@link sampleSystemValues}.
 */
export function previewSystemVariables(
  system: Record<string, string> = systemVariables(),
): Record<string, string> {
  const samples = sampleSystemValues(assetsUrl(system));
  const out: Record<string, string> = { ...samples };
  for (const [key, value] of Object.entries(system)) {
    if (value.trim() !== '' || !(key in samples)) out[key] = value;
  }
  return out;
}

export interface HostedAssetUrls {
  /** Image every not-yet-uploaded QR code shows. */
  qr: string;
  /** Link every not-yet-uploaded vCard points to. */
  vcard: string;
}

/**
 * Copy of `schema` whose QR / vCard blocks without a hosted file get
 * `urls` (and a matching content hash, computed with `variables`) —
 * the state the editor reaches once it has uploaded them.
 */
export function withHostedAssets(
  schema: SignatureSchema,
  variables: Record<string, string>,
  urls: HostedAssetUrls,
): SignatureSchema {
  const visit = (block: Block): Block => {
    if (block.type === 'qr_code') {
      const qr = block as QrCodeBlock;
      if (qr.image_url) return qr;
      return { ...qr, image_url: urls.qr, image_hash: qrContentHash(qr, variables) };
    }
    if (block.type === 'vcard') {
      const card = block as VCardBlock;
      if (card.vcf_url) return card;
      return { ...card, vcf_url: urls.vcard, vcf_hash: vcardContentHash(card, variables) };
    }
    return mapChildren(block, (children) => children.map(visit));
  };
  return { ...schema, blocks: (schema.blocks ?? []).map(visit) };
}

/**
 * Compiled HTML of `template` with `values` (signature variables, e.g.
 * the onboarding form) over the template's own examples, previewed with
 * sample brand-kit values and placeholder hosted assets. Null when the
 * template cannot be compiled.
 */
export function previewTemplateHtml(
  template: SignatureSchema,
  values: Record<string, string> = {},
  system: Record<string, string> = systemVariables(),
): string | null {
  try {
    // Older (1.0) admin templates: migrate first so nested QR / vCard
    // blocks are reached through `columns`.
    const current = schemaNeedsMigration(template) ? migrateSchema(template) : template;
    const previewSystem = previewSystemVariables(system);
    const own = { ...(current.variables ?? {}), ...values };
    const merged = resolvedVariables(own, previewSystem);
    const base = assetsUrl(previewSystem);
    const schema = withHostedAssets({ ...current, variables: merged }, merged, {
      qr: base !== '' ? `${base}/templates/qr-sample.png` : '',
      vcard: '#',
    });
    return compileSignature(schema).html;
  } catch {
    return null;
  }
}
