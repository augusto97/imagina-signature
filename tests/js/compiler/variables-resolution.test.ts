import { afterEach, describe, expect, it } from 'vitest';
import { isInternalVariable, resolvedVariables } from '@/core/compiler/variables';
import { qrContentHash, qrData } from '@/core/blocks/qr-code/definition';
import {
  buildVCardString,
  resolveVCardFields,
  vcardContentHash,
} from '@/core/blocks/vcard/definition';
import type { QrCodeBlock, VCardBlock } from '@/core/schema/blocks';
import { useSchemaStore } from '@/stores/schemaStore';
import { createEmptySchema } from '@/core/schema/signature';
import '@/core/blocks';

const SYSTEM = {
  imgsig_assets_url: 'https://site.example/wp-content/plugins/imagina-signatures/assets',
  wp_display_name: 'Lucía Fernández',
  company_name: 'Northwind',
  company_website: 'https://northwind.example',
};

describe('resolvedVariables', () => {
  it('expands system references inside signature variable values', () => {
    const merged = resolvedVariables(
      { photo_url: '{{imgsig_assets_url}}/templates/avatar-1.png', job_title: 'CEO' },
      SYSTEM,
    );
    expect(merged.photo_url).toBe(
      'https://site.example/wp-content/plugins/imagina-signatures/assets/templates/avatar-1.png',
    );
    expect(merged.job_title).toBe('CEO');
    expect(merged.company_name).toBe('Northwind');
  });

  it('expands one level, against system variables only', () => {
    const merged = resolvedVariables(
      { a: '{{b}}', b: 'B', company_name: '{{company_name}} Europe', c: '{{unknown}}' },
      SYSTEM,
    );
    // Signature → signature references are not followed (no chains).
    expect(merged.a).toBe('{{b}}');
    // An override may build on the system value it shadows.
    expect(merged.company_name).toBe('Northwind Europe');
    expect(merged.c).toBe('{{unknown}}');
  });

  it('flags plugin-internal variables', () => {
    expect(isInternalVariable('imgsig_assets_url')).toBe(true);
    expect(isInternalVariable('company_name')).toBe(false);
  });
});

describe('hosted QR / vCard content resolves variables', () => {
  afterEach(() => {
    useSchemaStore.getState().setSchema(createEmptySchema());
  });

  const qr: QrCodeBlock = {
    id: 'qr',
    type: 'qr_code',
    data: '{{company_website}}',
    size: 96,
    color: '#111827',
    background_color: '#ffffff',
  };

  const card: VCardBlock = {
    id: 'vc',
    type: 'vcard',
    label: 'Save',
    full_name: '{{wp_display_name}}',
    organization: '{{company_name}}',
    title: '{{job_title}}',
    email: '',
    phone: '',
    website: '{{company_website}}',
    background_color: '#111827',
    text_color: '#ffffff',
    border_radius: 4,
  };

  it('encodes the resolved QR data and hashes it', () => {
    const vars = resolvedVariables({}, SYSTEM);
    expect(qrData(qr, vars)).toBe('https://northwind.example');
    expect(qrContentHash(qr, vars)).toBe(
      qrContentHash({ ...qr, data: 'https://northwind.example' }, {}),
    );
  });

  it('writes the resolved fields into the .vcf', () => {
    const vars = resolvedVariables({ job_title: 'Directora' }, SYSTEM);
    const text = buildVCardString(resolveVCardFields(card, vars));
    expect(text).toContain('FN:Lucía Fernández');
    expect(text).toContain('ORG:Northwind');
    expect(text).toContain('TITLE:Directora');
    expect(text).toContain('URL:https://northwind.example');
    expect(text).not.toContain('{{');
    // A variable change invalidates the hosted file.
    expect(vcardContentHash(card, vars)).not.toBe(
      vcardContentHash(card, resolvedVariables({ job_title: 'CEO' }, SYSTEM)),
    );
  });

  it('defaults to the variables of the signature being edited', () => {
    useSchemaStore.getState().setSchema({
      ...createEmptySchema(),
      variables: { job_title: 'Gerente' },
    });
    expect(resolveVCardFields(card).title).toBe('Gerente');
  });
});
