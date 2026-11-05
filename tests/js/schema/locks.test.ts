import { describe, it, expect } from 'vitest';
import {
  applicableOverrides,
  detachedSchema,
  detailFields,
  editPolicy,
  lockedBlockIds,
  referencedVariables,
  refreshFromTemplate,
  templateJsonFor,
  type LinkContext,
} from '@/core/schema/locks';
import { validateSchema } from '@/core/schema/validators';
import { createEmptySchema, type SignatureSchema } from '@/core/schema/signature';
import type { ContainerBlock, HeadingBlock, TextBlock } from '@/core/schema/blocks';
import { findBlock } from '@/core/schema/tree';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useLinkStore } from '@/stores/linkStore';
import { useHistoryStore } from '@/stores/historyStore';

const ctx = (overrides: Partial<LinkContext>): LinkContext => ({
  mode: 'detached',
  templateId: null,
  employeeMode: 'free',
  templateName: '',
  canBypassLocks: false,
  ...overrides,
});

/** Same fixture as tests/php/Unit/Services/TemplateLinkTest.php::template(). */
function template(
  mode: 'free' | 'locked_design' | 'fields_only' = 'locked_design',
): SignatureSchema {
  const s = createEmptySchema();
  s.settings = { employee_mode: mode };
  s.variables = { tagline: 'Default tagline' };
  s.blocks = [
    { id: 'logo', type: 'image', src: 'https://cdn.acme.test/logo.png', alt: 'Acme', locked: true },
    {
      id: 'row',
      type: 'container',
      gap: 8,
      columns: [
        {
          id: 'col-a',
          width: 100,
          children: [
            {
              id: 'name',
              type: 'heading',
              content: '{{wp_display_name}}',
              content_html: '<p>{{wp_display_name}}</p>',
              style: { font_weight: 700 },
            } as HeadingBlock,
            {
              id: 'bio',
              type: 'text',
              content: '<p>{{tagline}}</p>',
              style: { color: '#333333' },
            } as TextBlock,
          ],
        },
      ],
    } as ContainerBlock,
    { id: 'legal', type: 'disclaimer', content: 'Confidential.', style: {}, locked: true },
  ];
  return s;
}

describe('editPolicy', () => {
  it('restricts nothing for a detached free signature or a template manager', () => {
    expect(editPolicy(ctx({})).enforced).toBe(false);
    const admin = editPolicy(
      ctx({ mode: 'linked', employeeMode: 'fields_only', canBypassLocks: true }),
    );
    expect(admin.enforced).toBe(false);
    expect(admin.fieldsOnly).toBe(false);
    expect(admin.canDetach).toBe(true);
  });

  it('maps each employee mode', () => {
    const free = editPolicy(ctx({ mode: 'linked' }));
    expect([free.enforced, free.structureLocked, free.canvasLocked, free.canDetach]).toEqual([
      true,
      false,
      false,
      true,
    ]);

    const design = editPolicy(ctx({ mode: 'linked', employeeMode: 'locked_design' }));
    expect([
      design.structureLocked,
      design.canvasLocked,
      design.fieldsOnly,
      design.canDetach,
    ]).toEqual([true, true, false, false]);

    const fields = editPolicy(ctx({ mode: 'linked', employeeMode: 'fields_only' }));
    expect(fields.fieldsOnly).toBe(true);

    // A detached copy of a restrictive template stays restricted, can't "detach" again.
    const copy = editPolicy(ctx({ employeeMode: 'locked_design' }));
    expect([copy.enforced, copy.linked, copy.canDetach]).toEqual([true, false, false]);
  });
});

describe('lockedBlockIds', () => {
  it('includes everything inside a locked container', () => {
    const t = template();
    (t.blocks[1] as ContainerBlock).locked = true;
    expect([...lockedBlockIds(t.blocks)].sort()).toEqual(['bio', 'legal', 'logo', 'name', 'row']);
  });
});

describe('overrides re-application', () => {
  it('rebuilds from the template keeping variables and unlocked text overrides', () => {
    const out = refreshFromTemplate(template(), {
      variables: { tagline: 'Mine', phone: '+1 555' },
      overrides: {
        bio: { content: '<p>I sell rockets.</p>', content_html: '<p>ignored for text</p>' },
        logo: { content: 'not text-like' },
        legal: { content: 'Locked: never applied' },
        gone: { content: 'block no longer exists' },
      },
    });

    expect((findBlock(out.blocks, 'bio') as TextBlock).content).toBe('<p>I sell rockets.</p>');
    expect(findBlock(out.blocks, 'bio')).not.toHaveProperty('content_html');
    expect((findBlock(out.blocks, 'legal') as TextBlock).content).toBe('Confidential.');
    expect(out.overrides).toEqual({ bio: { content: '<p>I sell rockets.</p>' } });
    expect(out.variables).toEqual({ tagline: 'Mine', phone: '+1 555' });
  });

  it('an edit made in the store survives a template update', () => {
    useLinkStore.setState({
      mode: 'linked',
      templateId: 4,
      employeeMode: 'locked_design',
      canBypassLocks: false,
    });
    useSchemaStore.setState({ schema: refreshFromTemplate(template(), {}), hasUserEdited: false });
    useHistoryStore.setState({ past: [], future: [] });
    endHistoryBurst();

    useSchemaStore
      .getState()
      .updateBlock('name', { content: 'Ana', content_html: '<p><strong>Ana</strong></p>' });

    // The administrator restyles the template; the server refreshes the row.
    const updated = template();
    (updated.blocks[1] as ContainerBlock).gap = 24;
    const refreshed = refreshFromTemplate(updated, useSchemaStore.getState().schema);

    expect((refreshed.blocks[1] as ContainerBlock).gap).toBe(24);
    expect((findBlock(refreshed.blocks, 'name') as HeadingBlock).content_html).toBe(
      '<p><strong>Ana</strong></p>',
    );
    useLinkStore.getState().reset();
  });

  it('fields_only applies no overrides', () => {
    const out = refreshFromTemplate(template('fields_only'), {
      overrides: { bio: { content: '<p>Mine</p>' } },
    });
    expect(out.overrides).toEqual({});
    expect((findBlock(out.blocks, 'bio') as TextBlock).content).toBe('<p>{{tagline}}</p>');
  });

  it('ignores a non-object overrides map', () => {
    expect(applicableOverrides([], template().blocks)).toEqual({});
  });
});

describe('detach / save as template', () => {
  it('detaching drops the overrides map and keeps the text', () => {
    const linked = refreshFromTemplate(template(), {
      overrides: { bio: { content: '<p>Mine</p>' } },
    });
    const detached = detachedSchema(linked);
    expect(detached).not.toHaveProperty('overrides');
    expect((findBlock(detached.blocks, 'bio') as TextBlock).content).toBe('<p>Mine</p>');
    expect(linked.overrides).toEqual({ bio: { content: '<p>Mine</p>' } });
  });

  it('a template saved from a linked signature carries the mode, not the overrides', () => {
    const linked = refreshFromTemplate(template(), {
      overrides: { bio: { content: '<p>Mine</p>' } },
    });
    const json = templateJsonFor(linked, 'fields_only');
    expect(json.settings).toEqual({ employee_mode: 'fields_only' });
    expect(json).not.toHaveProperty('overrides');
  });
});

describe('detailFields', () => {
  it('lists own and missing variables as editable, used profile values as read-only', () => {
    const s = template('fields_only');
    s.blocks.push({
      id: 't2',
      type: 'text',
      content: '<p>{{job_title}} · {{company_name}} · {{phone}}</p>',
      style: {},
    } as TextBlock);
    const fields = detailFields(s, {
      wp_display_name: 'Ana',
      job_title: 'CEO',
      company_name: 'Acme',
    });

    expect(referencedVariables(s)).toEqual([
      'wp_display_name',
      'tagline',
      'job_title',
      'company_name',
      'phone',
    ]);
    expect(fields.editable).toEqual(['tagline', 'phone']);
    expect(fields.profile).toEqual([
      ['wp_display_name', 'Ana'],
      ['job_title', 'CEO'],
    ]);
  });
});

describe('validateSchema (1.3.0 additions)', () => {
  it('accepts locks, employee modes and overrides (also PHP-shaped empty overrides)', () => {
    const s = template();
    s.overrides = { bio: { content: '<p>x</p>' } };
    expect(validateSchema(s)).toEqual([]);
    expect(validateSchema({ ...s, overrides: [] })).toEqual([]);
  });

  it('rejects a non-boolean lock, an unknown mode and malformed overrides', () => {
    const s = template() as unknown as Record<string, unknown>;
    (s.blocks as Array<Record<string, unknown>>)[0]!.locked = 'yes';
    s.settings = { employee_mode: 'root' };
    s.overrides = { bio: 'text' };
    expect(validateSchema(s).map((e) => e.path)).toEqual(
      expect.arrayContaining(['blocks[0].locked', 'settings.employee_mode', 'overrides.bio']),
    );
  });
});
