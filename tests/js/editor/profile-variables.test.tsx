import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PROFILE_KEYS, isProfileKey, isValidCustomFieldKey } from '@shared/profileFields';
import {
  isShadowedByProfile,
  profileVariableKeys,
  resolvedVariables,
  substituteVariables,
} from '@/core/compiler/variables';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import { VariablesEditor } from '@/editor/sidebar-right/VariablesEditor';
import { useSchemaStore } from '@/stores/schemaStore';
import type { TextBlock } from '@/core/schema/blocks';
import '@/core/blocks';

const config = (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Record<string, unknown> })
  .IMGSIG_EDITOR_CONFIG;

afterEach(() => {
  delete config.systemVariables;
  delete config.profileFields;
  delete config.profileUrl;
});

describe('profile variable precedence', () => {
  // A template ships example values for the profile keys.
  const template = {
    job_title: 'Directora comercial',
    phone: '+34 600 000 000',
    tagline: 'Hecho a mano',
    company_name: 'Mine',
  };

  it('a non-empty profile value wins over the signature variable', () => {
    const out = resolvedVariables(template, {
      job_title: 'CTO',
      phone: '',
      company_name: 'Acme',
      wp_first_name: 'Jane',
    });

    expect(out.job_title).toBe('CTO');
    // Empty profile value: the signature's value is the fallback.
    expect(out.phone).toBe('+34 600 000 000');
    // Non-profile keys keep the old rule (signature wins).
    expect(out.company_name).toBe('Mine');
    expect(out.tagline).toBe('Hecho a mano');
    expect(out.wp_first_name).toBe('Jane');
  });

  it('applies to the admin custom fields listed in the bootstrap', () => {
    config.profileFields = [
      { key: 'job_title', label: 'Job title', type: 'text', custom: false, readonly: false },
      { key: 'employee_id', label: 'Employee ID', type: 'text', custom: true, readonly: false },
    ];

    expect(profileVariableKeys()).toEqual([...PROFILE_KEYS, 'employee_id']);
    expect(resolvedVariables({ employee_id: 'E-0' }, { employee_id: 'E-42' }).employee_id).toBe(
      'E-42',
    );
    expect(isShadowedByProfile('employee_id', { employee_id: 'E-42' })).toBe(true);
    expect(isShadowedByProfile('employee_id', { employee_id: '' })).toBe(false);
    expect(isShadowedByProfile('tagline', { tagline: 'x' })).toBe(false);
  });

  it('the compiler ships the profile value, escaped', () => {
    config.systemVariables = { job_title: 'R&D <Lead>', department: '' };
    const schema = createEmptySchema();
    const block: TextBlock = {
      id: 't1',
      type: 'text',
      content: '<p>{{job_title}} · {{department}}</p>',
      style: { font_family: 'Arial', font_size: 13, font_weight: 400, color: '#111' },
    };
    schema.blocks.push(block);
    schema.variables = { job_title: 'Directora comercial', department: 'Ventas' };

    const { html } = compileSignature(schema);
    expect(html).toContain('R&amp;D &lt;Lead&gt; · Ventas');
    expect(html).not.toContain('Directora comercial');
  });

  it('substitution itself is unchanged for plain maps', () => {
    expect(substituteVariables('{{job_title}}', { job_title: 'A&B' }).html).toBe('A&amp;B');
  });

  it('shared helpers mirror the server rules', () => {
    expect(isProfileKey('photo_url')).toBe(true);
    expect(isProfileKey('wp_email')).toBe(false);
    expect(isValidCustomFieldKey('employee_id')).toBe(true);
    expect(isValidCustomFieldKey('job_title')).toBe(false);
    expect(isValidCustomFieldKey('wp_secret')).toBe(false);
    expect(isValidCustomFieldKey('company_size')).toBe(false);
    expect(isValidCustomFieldKey('9lives')).toBe(false);
  });
});

describe('Variables panel: "Your profile"', () => {
  beforeEach(() => {
    const schema = createEmptySchema();
    schema.variables = { job_title: 'Directora comercial', phone: '+34 600 000 000' };
    useSchemaStore.setState({ schema });
    config.systemVariables = {
      wp_display_name: 'Jane Doe',
      job_title: 'CTO',
      phone: '',
      company_name: 'Acme',
    };
    config.profileFields = [
      { key: 'job_title', label: 'Job title', type: 'text', custom: false, readonly: false },
      { key: 'phone', label: 'Phone', type: 'phone', custom: false, readonly: false },
    ];
    config.profileUrl = 'http://localhost/wp-admin/admin.php?page=imagina-signatures-profile';
  });

  it('lists profile fields first, read-only, with an Edit profile link', () => {
    render(<VariablesEditor />);

    const link = screen.getByRole('link', { name: /edit profile/i });
    expect(link).toHaveAttribute('href', config.profileUrl);
    expect(link).toHaveAttribute('target', '_blank');

    const group = link.closest('div') as HTMLElement;
    const rows = within(group).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('job_titleCTO'),
      expect.stringContaining('phone(empty in profile)'),
      expect.stringContaining('wp_display_nameJane Doe'),
    ]);
    // Profile rows carry the field label as a tooltip.
    expect(rows[0]).toHaveAttribute('title', 'Job title');
    // Empty profile phone: the signature's own value ships, row marked overridden.
    expect(rows[1]).toHaveAttribute('title', expect.stringMatching(/overridden/i));
  });

  it('flags signature variables a profile value replaces', () => {
    render(<VariablesEditor />);

    const notes = screen.getAllByText('Your profile value is used instead of this one.');
    expect(notes).toHaveLength(1);
    const row = notes[0]!.closest('li') as HTMLElement;
    expect(within(row).getByDisplayValue('Directora comercial')).toBeInTheDocument();
  });
});
