import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FieldsOnlyView } from '@/editor/FieldsOnlyView';
import { EditorShell } from '@/editor/EditorShell';
import { LinkBanner } from '@/editor/LinkBanner';
import { RightSidebar } from '@/editor/sidebar-right/RightSidebar';
import { LayersPanel } from '@/editor/sidebar-left/LayersPanel';
import { BlockLibrary } from '@/editor/sidebar-left/BlockLibrary';
import { useSchemaStore, endHistoryBurst } from '@/stores/schemaStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useLinkStore } from '@/stores/linkStore';
import {
  createEmptySchema,
  type EmployeeMode,
  type SignatureSchema,
} from '@/core/schema/signature';
import type { ImageBlock, TextBlock } from '@/core/schema/blocks';
import '@/core/blocks';

type Config = Record<string, unknown>;
const globalConfig = (): Config =>
  (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Config }).IMGSIG_EDITOR_CONFIG;
let savedConfig: Config;

function schema(): SignatureSchema {
  const s = createEmptySchema();
  s.blocks = [
    {
      id: 'logo',
      type: 'image',
      src: 'https://cdn.acme.test/logo.png',
      alt: 'Acme',
      width: 120,
      locked: true,
    } as ImageBlock,
    {
      id: 'name',
      type: 'text',
      content: '<p>{{wp_display_name}} · {{job_title}}</p>',
      style: {},
    } as TextBlock,
    {
      id: 'bio',
      type: 'text',
      content: '<p>{{tagline}}</p>',
      style: { color: '#333333' },
    } as TextBlock,
  ];
  s.variables = { tagline: '' };
  s.overrides = {};
  return s;
}

function link(employeeMode: EmployeeMode, canBypassLocks = false, canManageLocks = false): void {
  useLinkStore.setState({
    mode: 'linked',
    templateId: 4,
    employeeMode,
    canBypassLocks,
    canManageLocks,
    templateName: 'Corporate',
  });
}

beforeEach(() => {
  savedConfig = { ...globalConfig() };
  Object.assign(globalConfig(), {
    systemVariables: {
      wp_display_name: 'Ana Pérez',
      job_title: 'Head of Sales',
      company_name: 'Acme',
    },
    signaturesUrl: '/wp-admin/admin.php?page=imagina-signatures',
    pluginVersion: __BUNDLE_VERSION__,
  });
  useSchemaStore.setState({ schema: schema(), hasUserEdited: false });
  useHistoryStore.setState({ past: [], future: [] });
  useSelectionStore.setState({ selectedBlockId: null, hoveredBlockId: null });
  endHistoryBurst();
});

afterEach(() => {
  cleanup();
  (globalThis as unknown as { IMGSIG_EDITOR_CONFIG: Config }).IMGSIG_EDITOR_CONFIG = savedConfig;
  useLinkStore.getState().reset();
});

describe('fields_only — "Your details"', () => {
  beforeEach(() => link('fields_only'));

  it('uses the onboarding details form: own fields editable, profile values read-only', () => {
    render(<FieldsOnlyView />);

    expect(screen.getAllByText('Your details').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Tagline')).not.toHaveAttribute('readonly');
    expect(screen.getByDisplayValue('Head of Sales')).toHaveAttribute('readonly');
    expect(screen.getByDisplayValue('Ana Pérez')).toHaveAttribute('readonly');
    // Only what the design uses: it never references {{company_name}}.
    expect(screen.queryByDisplayValue('Acme')).not.toBeInTheDocument();
    // No profile page configured: no dead link.
    expect(screen.queryByText('Edit profile')).not.toBeInTheDocument();
  });

  it('typing updates the variable and the live preview', () => {
    const { container } = render(<FieldsOnlyView />);

    fireEvent.change(screen.getByLabelText('Tagline'), {
      target: { value: 'Rockets for everyone' },
    });

    expect(useSchemaStore.getState().schema.variables.tagline).toBe('Rockets for everyone');
    const preview = container.querySelector('iframe');
    expect(preview?.getAttribute('srcdoc')).toContain('Rockets for everyone');
    expect(preview?.getAttribute('srcdoc')).toContain('Head of Sales');
  });

  it('replaces the canvas tools in the editor shell', () => {
    const { container } = render(<EditorShell />);

    expect(container.querySelector('[data-imgsig-fields-only]')).not.toBeNull();
    expect(container.querySelector('.is-canvas-root')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Layers$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Detach from template' })).not.toBeInTheDocument();
  });
});

describe('locked_design / locked blocks in the sidebars', () => {
  it('a locked block shows a notice instead of its properties', () => {
    link('free');
    useSelectionStore.setState({ selectedBlockId: 'logo' });
    render(<RightSidebar />);

    expect(screen.getByText('This block is locked')).toBeInTheDocument();
  });

  it('locked_design exposes only the text of an unlocked text block', () => {
    link('locked_design');
    useSelectionStore.setState({ selectedBlockId: 'bio' });
    const { container } = render(<RightSidebar />);

    expect(container.querySelector('.ProseMirror')).not.toBeNull();
    expect(screen.queryByText('Typography')).not.toBeInTheDocument();
    expect(
      screen.getByText('Fonts, colours and layout come from your company template.'),
    ).toBeInTheDocument();
  });

  it('locked_design fixes the canvas panel and the block library', () => {
    link('locked_design');
    render(
      <>
        <RightSidebar />
        <BlockLibrary />
      </>,
    );

    expect(screen.queryByText('Default font')).not.toBeInTheDocument();
    expect(screen.getByText('Variables')).toBeInTheDocument();
    expect(screen.getByText('The layout is managed by your company template')).toBeInTheDocument();
  });

  it('the banner offers "Detach" only when the template is free', () => {
    link('free');
    const { unmount } = render(<LinkBanner />);
    expect(screen.getByText(/Follows the company template “Corporate”/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detach from template' })).toBeInTheDocument();
    unmount();

    link('locked_design');
    render(<LinkBanner />);
    expect(screen.queryByRole('button', { name: 'Detach from template' })).not.toBeInTheDocument();
  });
});

describe('Layers panel locks', () => {
  it('employees see the lock and lose the row actions of locked blocks', () => {
    link('free');
    render(<LayersPanel />);

    const rows = screen.getAllByRole('listitem');
    const logoRow = rows[0]!;
    expect(within(logoRow).getByLabelText('Locked block')).toBeInTheDocument();
    expect(within(logoRow).queryByTitle('Delete')).not.toBeInTheDocument();
    expect(within(rows[2]!).getByTitle('Delete')).toBeInTheDocument();
  });

  it('template managers toggle locks from a layer row', () => {
    link('free', true, true);
    render(<LayersPanel />);

    fireEvent.click(screen.getAllByTitle('Lock block for employees')[0]!);
    expect(useSchemaStore.getState().schema.blocks[1]?.locked).toBe(true);

    fireEvent.click(screen.getAllByTitle('Unlock block')[0]!);
    expect(useSchemaStore.getState().schema.blocks[0]?.locked).toBeUndefined();
  });
});
