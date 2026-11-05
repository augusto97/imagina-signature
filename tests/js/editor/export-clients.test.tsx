import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ExportModal } from '@/editor/modals/ExportModal';
import { useEditorStore } from '@/stores/editorStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block } from '@/core/schema/blocks';
import '@/core/blocks';

const text = (id: string, color = '#111111'): Block => ({
  id,
  type: 'text',
  content: 'Jane Doe',
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color },
});

function setBlocks(blocks: Block[]): void {
  const schema = createEmptySchema();
  schema.blocks = blocks;
  useSchemaStore.setState({ schema });
}

const urlApi = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
let blobs: Blob[] = [];
let clicked: HTMLAnchorElement[] = [];

beforeEach(() => {
  blobs = [];
  clicked = [];
  // jsdom has no object URLs: provide them for this file only.
  urlApi.createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b);
    return `blob:test/${blobs.length}`;
  });
  urlApi.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
  usePersistenceStore.setState({ signatureName: 'Jane Doe / Sales' });
});

afterEach(() => {
  delete urlApi.createObjectURL;
  delete urlApi.revokeObjectURL;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useEditorStore.setState({ modal: null });
});

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

describe('Export → Gmail / Google Workspace', () => {
  it('shows the pre-flight checklist with the character count and lets a clean signature copy', async () => {
    setBlocks([text('t')]);
    useEditorStore.setState({ modal: 'export' });
    const write = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { write, writeText: vi.fn() } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    );
    render(<ExportModal />);

    expect(screen.getByText('Before you copy')).toBeInTheDocument();
    expect(screen.getByText(/Length: [\d,]+ of 10,000 characters/)).toBeInTheDocument();
    expect(screen.getByText('No embedded (data:) images')).toBeInTheDocument();
    expect(screen.getByText('0 image(s) in total')).toBeInTheDocument();
    expect(screen.queryByText(/Copying is on hold/)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy for Gmail' }));
    });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('holds the copy back when an error-level issue exists, but allows "Copy anyway"', () => {
    setBlocks([
      { id: 'logo', type: 'image', src: 'data:image/png;base64,AA', alt: 'Logo', width: 80 },
    ]);
    useEditorStore.setState({ modal: 'export' });
    render(<ExportModal />);

    expect(screen.getByText(/Copying is on hold/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy for Gmail' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy anyway' })).toBeInTheDocument();
    expect(screen.getByText('1 embedded (data:) image(s)')).toBeInTheDocument();
  });
});

describe('Export → Outlook for Windows (classic)', () => {
  it('downloads a Word-friendly .htm and a .txt with the same Windows-safe name', async () => {
    setBlocks([text('t')]);
    useEditorStore.setState({ modal: 'export' });
    render(<ExportModal />);
    fireEvent.click(screen.getByRole('tab', { name: 'Outlook for Windows (classic)' }));

    expect(screen.getByText(/%APPDATA%\\Microsoft\\Signatures/)).toBeInTheDocument();
    expect(screen.getByText(/Close Outlook completely/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download for Outlook (.htm)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download plain text (.txt)' }));

    expect(clicked.map((a) => a.download)).toEqual(['Jane Doe Sales.htm', 'Jane Doe Sales.txt']);
    const htm = await readBlob(blobs[0]!);
    const doc = new DOMParser().parseFromString(htm.replace(/^\uFEFF/, ''), 'text/html');
    expect(doc.documentElement.getAttribute('xmlns:w')).toBe(
      'urn:schemas-microsoft-com:office:word',
    );
    expect(doc.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
    expect(doc.querySelector('.WordSection1 > table')).not.toBeNull();
    expect(doc.body.textContent).toContain('Jane Doe');

    const txt = await readBlob(blobs[1]!);
    expect(txt).toContain('Jane Doe\r\n');
  });
});

describe('Export → Apple Mail', () => {
  it('opens a signature-only page in a new tab', async () => {
    setBlocks([text('t')]);
    useEditorStore.setState({ modal: 'export' });
    render(<ExportModal />);
    fireEvent.click(screen.getByRole('tab', { name: 'Apple Mail' }));
    expect(screen.getByText(/Always match my default message font/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open signature in a new tab' }));
    expect(clicked[0]!.target).toBe('_blank');
    const page = await readBlob(blobs[0]!);
    const doc = new DOMParser().parseFromString(page, 'text/html');
    expect(doc.body.children).toHaveLength(1);
    expect(doc.body.firstElementChild!.tagName).toBe('TABLE');
  });
});

describe('Export → Mobile', () => {
  it('explains the send-to-yourself flow and the iOS shake-to-undo step', () => {
    setBlocks([text('t')]);
    useEditorStore.setState({ modal: 'export' });
    render(<ExportModal />);
    fireEvent.click(screen.getByRole('tab', { name: 'Mobile' }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('button', { name: 'Send to my email' })).toBeInTheDocument();
    expect(within(panel).getByText(/shake the iPhone and tap "Undo"/)).toBeInTheDocument();
    expect(within(panel).getByText('Gmail app (Android / iPhone)')).toBeInTheDocument();
    expect(within(panel).getByText('Outlook app (Android / iPhone)')).toBeInTheDocument();
  });
});
