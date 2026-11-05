import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SignatureSchema } from '@/core/schema/signature';
import { setAssetsBaseUrl } from '@/core/compiler/assets';
import { resolvedVariables } from '@/core/compiler/variables';
import { withHostedAssets } from '@/editor/templates/templatePreview';

/**
 * Shared fixture for the tests that compile every shipped template
 * (`templates/*.json`) the way a real site would: the mock profile and
 * brand-kit values below play the part of `IMGSIG_EDITOR_CONFIG.systemVariables`,
 * and QR / vCard blocks get the hosted files the editor uploads right
 * after a template is applied.
 */

export const TEMPLATES_DIR = resolve(__dirname, '../../../templates');

/** Plugin root on the mock site. */
export const PLUGIN_URL = 'https://northwind.example.com/wp-content/plugins/imagina-signatures';
/** `imgsig_assets_url` on the mock site. */
export const ASSETS_URL = `${PLUGIN_URL}/assets`;

export const MOCK_SYSTEM_VARIABLES: Record<string, string> = {
  wp_display_name: 'Lucía Fernández',
  wp_email: 'lucia.fernandez@northwind.es',
  wp_first_name: 'Lucía',
  wp_last_name: 'Fernández',
  wp_url: '',
  company_name: 'Northwind',
  company_tagline: 'Soluciones digitales para empresas que crecen',
  company_website: 'https://www.northwind.es',
  company_phone: '+34 910 000 100',
  company_email: 'hola@northwind.es',
  company_address: 'Calle de Alcalá 120, 28009 Madrid',
  company_logo: `${ASSETS_URL}/templates/logo-1.png`,
  company_linkedin: 'https://www.linkedin.com/company/northwind',
  company_x: 'https://x.com/northwind',
  company_facebook: 'https://www.facebook.com/northwind',
  company_instagram: 'https://www.instagram.com/northwind',
  company_youtube: 'https://www.youtube.com/@northwind',
  company_tiktok: 'https://www.tiktok.com/@northwind',
  company_github: 'https://github.com/northwind',
  company_whatsapp: 'https://wa.me/34600000100',
  imgsig_assets_url: ASSETS_URL,
};

/** Where the mock site serves the hosted QR / vCard files. */
export const HOSTED = {
  qr: `${ASSETS_URL}/templates/qr-sample.png`,
  vcard: 'https://northwind.example.com/wp-content/uploads/imagina-signatures/1/contacto.vcf',
};

type ConfigHost = { IMGSIG_EDITOR_CONFIG: { systemVariables?: Record<string, string> } };

/**
 * Installs the mock system variables and plugin URL; returns a function
 * restoring the previous state (call it in `afterAll`).
 */
export function installMockSite(): () => void {
  const config = (globalThis as unknown as ConfigHost).IMGSIG_EDITOR_CONFIG;
  const previous = config.systemVariables;
  config.systemVariables = { ...MOCK_SYSTEM_VARIABLES };
  setAssetsBaseUrl(PLUGIN_URL);
  return () => {
    config.systemVariables = previous;
    setAssetsBaseUrl(null);
  };
}

export const templateSlugs: string[] = readdirSync(TEMPLATES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

export function loadTemplate(slug: string): SignatureSchema {
  return JSON.parse(readFileSync(resolve(TEMPLATES_DIR, `${slug}.json`), 'utf8')) as SignatureSchema;
}

/** Template variables over the mock system variables (the export's merged map). */
export function mergedVariables(schema: SignatureSchema): Record<string, string> {
  return resolvedVariables(schema.variables ?? {}, MOCK_SYSTEM_VARIABLES);
}

/** The template as the editor holds it once its QR / vCard files are uploaded. */
export function appliedTemplate(slug: string): SignatureSchema {
  const schema = loadTemplate(slug);
  return withHostedAssets(schema, mergedVariables(schema), HOSTED);
}
