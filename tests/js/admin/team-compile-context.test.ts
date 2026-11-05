import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compileWithContext, loadCompiler } from '@admin/pages/team/compileWithContext';
import { createEmptySchema, type SignatureSchema } from '@/core/schema/signature';
import type { TextBlock } from '@/core/schema/blocks';
import type { RenderContext } from '@admin/pages/team/types';

type Host = { IMGSIG_EDITOR_CONFIG?: Record<string, unknown> };
const host = (): Host => globalThis as unknown as Host;
let saved: Record<string, unknown> | undefined;

beforeEach(() => {
  saved = host().IMGSIG_EDITOR_CONFIG;
});

afterEach(() => {
  host().IMGSIG_EDITOR_CONFIG = saved;
});

function schema(): SignatureSchema {
  const s = createEmptySchema();
  s.blocks = [
    {
      id: 'name',
      type: 'text',
      content: '<p>{{wp_display_name}} · {{job_title}} · {{company_name}}</p>',
    } as TextBlock,
  ];
  // The template ships an example job title; a non-empty profile value wins.
  s.variables = { job_title: 'Directora comercial' };
  return s;
}

function context(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    id: 5,
    user_id: 3,
    name: 'Ana main',
    template_id: null,
    link_mode: 'detached',
    updated_at: '2026-11-05 10:00:00',
    compiled_at: null,
    locale: 'pt_BR',
    json_content: schema(),
    systemVariables: {
      wp_display_name: 'Ana Souza',
      job_title: 'Head of Sales',
      company_name: 'Acme',
    },
    complianceFooter: { enabled: true, html: '<p>Sales legal notice</p>' },
    bannerCampaigns: [
      {
        id: 'spring',
        name: 'Spring',
        enabled: true,
        image_url: 'https://cdn.acme.test/spring.png',
        link_url: 'https://acme.test/spring',
        alt: 'Spring sale',
        width: 400,
        start_date: '',
        end_date: '',
      },
    ],
    profileFields: [],
    pluginUrl: 'https://acme.test/wp-content/plugins/imagina-signatures',
    inputs_hash: 'h',
    ...overrides,
  };
}

describe('compiling another user’s signature in the admin', () => {
  it('uses the owner’s variables, footer, campaigns and language — like their editor', async () => {
    // The administrator's own bootstrap must not leak into the result.
    host().IMGSIG_EDITOR_CONFIG = {
      ...(saved ?? {}),
      locale: 'en_US',
      systemVariables: { wp_display_name: 'Admin Person', job_title: 'Administrator' },
      complianceFooter: { enabled: true, html: '<p>Admin footer</p>' },
      bannerCampaigns: [],
    };
    const compile = await loadCompiler();

    const out = compileWithContext(compile, context());

    expect(out.html).toContain('Ana Souza · Head of Sales · Acme');
    expect(out.html).not.toContain('Admin Person');
    expect(out.html).toContain('Sales legal notice');
    expect(out.html).not.toContain('Admin footer');
    expect(out.html).toContain('https://cdn.acme.test/spring.png');
    expect(out.html).toContain('lang="pt-BR"');
    expect(out.html).not.toMatch(/<!DOCTYPE|<body/i);
    expect(out.text).toContain('Ana Souza');

    // The administrator's config is back afterwards.
    expect(host().IMGSIG_EDITOR_CONFIG?.locale).toBe('en_US');
    expect(host().IMGSIG_EDITOR_CONFIG?.complianceFooter).toEqual({
      enabled: true,
      html: '<p>Admin footer</p>',
    });
  });

  it('removes the temporary config when there was none (the admin bundle has no editor config)', async () => {
    delete host().IMGSIG_EDITOR_CONFIG;
    const compile = await loadCompiler();

    compileWithContext(compile, context({ complianceFooter: { enabled: false, html: '' } }));

    expect('IMGSIG_EDITOR_CONFIG' in globalThis).toBe(false);
  });

  it('refuses a context without a usable schema and still restores the config', async () => {
    host().IMGSIG_EDITOR_CONFIG = { ...(saved ?? {}), locale: 'en_US' };
    const compile = await loadCompiler();

    expect(() => compileWithContext(compile, context({ json_content: [] }))).toThrow(
      'This signature has no readable content.',
    );
    expect(() =>
      compileWithContext(() => {
        throw new Error('compiler exploded');
      }, context()),
    ).toThrow('compiler exploded');
    expect(host().IMGSIG_EDITOR_CONFIG?.locale).toBe('en_US');
  });
});
