import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OnboardingModal } from '@/editor/onboarding/OnboardingModal';
import { OnboardingHost } from '@/editor/onboarding/OnboardingHost';
import { YourDetailsModal } from '@/editor/onboarding/YourDetailsModal';
import { TemplatePicker } from '@/editor/modals/TemplatePicker';
import { endHistoryBurst, useSchemaStore } from '@/stores/schemaStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useEditorStore } from '@/stores/editorStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { useTemplateLibraryStore, type TemplateRow } from '@/stores/templateLibraryStore';
import { createEmptySchema, type SignatureSchema } from '@/core/schema/signature';
import type { HeadingBlock, TextBlock } from '@/core/schema/blocks';
import { detailFields, variablesFromForm } from '@/editor/templates/templateDetails';
import { filterTemplates } from '@/editor/templates/templateLibrary';
import '@/core/blocks';

const SYSTEM = {
  wp_display_name: 'Lucía Fernández',
  wp_email: 'lucia@northwind.example',
  company_name: 'Northwind',
  company_tagline: '',
  imgsig_assets_url: 'https://northwind.example/wp-content/plugins/imagina-signatures/assets',
};

type ConfigHost = {
  IMGSIG_EDITOR_CONFIG: { systemVariables?: Record<string, string>; signatureId: number };
};
const config = (globalThis as unknown as ConfigHost).IMGSIG_EDITOR_CONFIG;

function templateSchema(): SignatureSchema {
  const schema = createEmptySchema();
  const name: HeadingBlock = {
    id: 'name',
    type: 'heading',
    content: '{{wp_display_name}}',
    content_html: '<p>{{wp_display_name}}</p>',
    style: {},
  };
  const role: TextBlock = {
    id: 'role',
    type: 'text',
    content: '{{job_title}} · {{company_name}} · {{company_tagline}}',
    style: {},
  };
  schema.blocks = [name, role];
  schema.variables = { job_title: 'Directora de Marketing', phone: '+34 910 555 210' };
  return schema;
}

const ROWS: TemplateRow[] = [
  {
    id: 1,
    slug: 'corporate-sidebar',
    name: 'Corporate sidebar',
    description: 'Round photo beside your details.',
    category: 'corporate',
    preview_url: null,
    json_content: templateSchema(),
  },
  {
    id: 2,
    slug: 'real-estate-agent',
    name: 'Property agent',
    description: 'Three columns with a QR code.',
    category: 'real-estate',
    preview_url: null,
    json_content: templateSchema(),
  },
];

function stubTemplates(rows: TemplateRow[] = ROWS): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(rows), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
}

let previousSystem: Record<string, string> | undefined;

beforeEach(() => {
  previousSystem = config.systemVariables;
  config.systemVariables = { ...SYSTEM };
  useTemplateLibraryStore.setState({ templates: null, error: null, loading: false });
  useSchemaStore.setState({ schema: createEmptySchema(), hasUserEdited: false });
  useHistoryStore.setState({ past: [], future: [] });
  endHistoryBurst();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  config.systemVariables = previousSystem;
  config.signatureId = 0;
  useEditorStore.setState({ modal: null });
});

describe('details form model', () => {
  it('lists profile, signature and company fields with read-only profile values', () => {
    const fields = detailFields(templateSchema(), SYSTEM);
    expect(fields.map((f) => [f.key, f.source, f.readOnly])).toEqual([
      ['wp_display_name', 'profile', true],
      ['job_title', 'signature', false],
      ['phone', 'signature', false],
      ['company_name', 'company', true],
      // Blank in the brand kit: can be filled in for this signature.
      ['company_tagline', 'company', false],
    ]);
    expect(fields[0]!.label).toBe('Full name');
    expect(fields[1]!.label).toBe('Job title');
  });

  it('treats employee profile fields as profile fields: read-only when filled, editable when blank', () => {
    // 1.3.0: a non-empty profile value is what ships, so it can't be typed over here.
    const system = { ...SYSTEM, job_title: 'CTO', phone: '' };
    const fields = detailFields(templateSchema(), system);
    expect(fields.map((f) => [f.key, f.source, f.readOnly])).toEqual([
      ['wp_display_name', 'profile', true],
      ['job_title', 'profile', true],
      ['phone', 'profile', false],
      ['company_name', 'company', true],
      ['company_tagline', 'company', false],
    ]);
    expect(fields[1]!.systemValue).toBe('CTO');
    // The read-only profile value is not copied into the signature; a
    // blank profile field filled in here is stored as the fallback.
    expect(
      variablesFromForm(fields, { job_title: 'x', phone: '+34 600' }, { job_title: 'Directora' }),
    ).toEqual({
      job_title: 'Directora',
      phone: '+34 600',
    });
  });

  it('never lists plugin-internal variables', () => {
    const schema = templateSchema();
    schema.variables.photo_url = '{{imgsig_assets_url}}/templates/avatar-1.png';
    const keys = detailFields(schema, SYSTEM).map((f) => f.key);
    expect(keys).toContain('photo_url');
    expect(keys).not.toContain('imgsig_assets_url');
  });

  it('stores a blank-brand-kit override only when it is filled in', () => {
    const fields = detailFields(templateSchema(), SYSTEM);
    const base = { job_title: 'Directora', phone: '1' };
    expect(
      variablesFromForm(fields, { job_title: 'CEO', phone: '', company_tagline: '' }, base),
    ).toEqual({
      job_title: 'CEO',
      phone: '',
    });
    expect(
      variablesFromForm(
        fields,
        { job_title: 'CEO', phone: '2', company_tagline: ' Since 1999 ' },
        base,
      ),
    ).toEqual({ job_title: 'CEO', phone: '2', company_tagline: 'Since 1999' });
  });
});

describe('template search', () => {
  it('matches name, description and the translated category, ignoring accents', () => {
    expect(filterTemplates(ROWS, 'all', 'qr').map((t) => t.id)).toEqual([2]);
    expect(filterTemplates(ROWS, 'all', 'real estate').map((t) => t.id)).toEqual([2]);
    expect(filterTemplates(ROWS, 'all', 'CORPORATE').map((t) => t.id)).toEqual([1]);
    expect(filterTemplates(ROWS, 'corporate', 'property')).toEqual([]);
    const accented = [{ ...ROWS[0]!, name: 'Clínica' }];
    expect(filterTemplates(accented, 'all', 'clinica')).toHaveLength(1);
  });
});

describe('onboarding', () => {
  it('opens for a new, empty signature once the editor has loaded', () => {
    config.signatureId = 0;
    usePersistenceStore.setState({ isLoaded: false });
    render(<OnboardingHost />);
    expect(useEditorStore.getState().modal).toBeNull();
    act(() => usePersistenceStore.setState({ isLoaded: true }));
    expect(useEditorStore.getState().modal).toBe('onboarding');
  });

  it('stays closed for an existing signature', () => {
    config.signatureId = 12;
    usePersistenceStore.setState({ isLoaded: true });
    render(<OnboardingHost />);
    expect(useEditorStore.getState().modal).toBeNull();
  });

  it('picks a template, edits the details and creates the signature undoably', async () => {
    stubTemplates();
    useEditorStore.setState({ modal: 'onboarding' });
    render(<OnboardingModal />);

    // Step 1: translated chips, a count and the cards.
    expect(await screen.findByText('Corporate sidebar')).toBeInTheDocument();
    expect(screen.getByText('2 templates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Real estate' })).toBeInTheDocument();
    expect(document.querySelectorAll('iframe[sandbox]').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Corporate sidebar'));

    // Step 2: profile field read-only, examples prefilled.
    const name = screen.getByLabelText('Full name') as HTMLInputElement;
    expect(name.value).toBe('Lucía Fernández');
    expect(name.readOnly).toBe(true);
    const title = screen.getByLabelText('Job title') as HTMLInputElement;
    expect(title.value).toBe('Directora de Marketing');
    fireEvent.change(title, { target: { value: 'Head of Growth' } });
    fireEvent.change(screen.getByLabelText('Company tagline'), { target: { value: 'Since 1999' } });

    fireEvent.click(screen.getByText('Create signature'));

    const schema = useSchemaStore.getState().schema;
    expect(schema.blocks.map((b) => b.id)).toEqual(['name', 'role']);
    expect(schema.variables).toEqual({
      job_title: 'Head of Growth',
      phone: '+34 910 555 210',
      company_tagline: 'Since 1999',
    });
    expect(useEditorStore.getState().modal).toBeNull();

    act(() => {
      useSchemaStore.getState().undo();
    });
    expect(useSchemaStore.getState().schema.blocks).toEqual([]);
  });

  it('"Start blank" just closes the dialog', async () => {
    stubTemplates();
    useEditorStore.setState({ modal: 'onboarding' });
    render(<OnboardingModal />);
    fireEvent.click(await screen.findByText('Start blank'));
    expect(useEditorStore.getState().modal).toBeNull();
    expect(useSchemaStore.getState().schema.blocks).toEqual([]);
  });
});

describe('Your details (topbar)', () => {
  it('edits the current signature’s variables in one undoable step', async () => {
    const schema = templateSchema();
    useSchemaStore.setState({ schema, hasUserEdited: false });
    useEditorStore.setState({ modal: 'your-details' });
    render(<YourDetailsModal />);

    const title = screen.getByLabelText('Job title') as HTMLInputElement;
    expect(title.value).toBe('Directora de Marketing');
    fireEvent.change(title, { target: { value: 'CEO' } });
    fireEvent.click(screen.getByText('Save details'));

    await waitFor(() => expect(useSchemaStore.getState().schema.variables.job_title).toBe('CEO'));
    expect(useEditorStore.getState().modal).toBeNull();
    act(() => {
      useSchemaStore.getState().undo();
    });
    expect(useSchemaStore.getState().schema.variables.job_title).toBe('Directora de Marketing');
  });
});

describe('template picker polish', () => {
  it('shows translated category chips, a count and searches categories', async () => {
    stubTemplates();
    useEditorStore.setState({ modal: 'template-picker' });
    render(<TemplatePicker />);
    expect(await screen.findByText('2 templates')).toBeInTheDocument();
    const chips = screen.getByRole('group', { name: 'Categories' });
    expect(within(chips).getByText('Corporate')).toBeInTheDocument();
    expect(within(chips).getByText('Real estate')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search templates'), {
      target: { value: 'real estate' },
    });
    expect(screen.getByText('1 of 2 templates')).toBeInTheDocument();
    expect(screen.queryByText('Corporate sidebar')).toBeNull();
    expect(screen.getByText('Property agent')).toBeInTheDocument();
  });
});
