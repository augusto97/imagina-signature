import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  chunk,
  detectDelimiter,
  emptyImportResult,
  guessMapping,
  mergeImportResults,
  normaliseHeader,
  parseCsv,
} from '@admin/pages/groups/csv';
import { ImportTab } from '@admin/pages/groups/ImportTab';
import type { ImportChunkResult } from '@admin/directoryTypes';

const FIELDS = [
  { key: 'job_title', label: 'Job title' },
  { key: 'phone', label: 'Phone' },
  { key: 'employee_id', label: 'Employee ID' },
];

describe('parseCsv / detectDelimiter', () => {
  it('handles quotes, embedded delimiters / newlines, CRLF and a BOM', () => {
    const text =
      '﻿email,title,notes\r\n"ana@acme.com","CEO, founder","line 1\nline 2"\r\nluis@acme.com,"Say ""hi""",\r\n\r\n';
    const { delimiter, rows } = parseCsv(text);
    expect(delimiter).toBe(',');
    expect(rows).toEqual([
      ['email', 'title', 'notes'],
      ['ana@acme.com', 'CEO, founder', 'line 1\nline 2'],
      ['luis@acme.com', 'Say "hi"', ''],
    ]);
  });

  it('detects semicolons, tabs and pipes', () => {
    expect(detectDelimiter('email;cargo;teléfono\nana@acme.com;CEO;+34 600, 1')).toBe(';');
    expect(detectDelimiter('email\ttitle\nana@acme.com\tCEO')).toBe('\t');
    expect(detectDelimiter('email|title\na@b.c|x')).toBe('|');
    // Commas inside quotes don't count.
    expect(detectDelimiter('email;title\n"a@b.c";"CEO, founder, owner"')).toBe(';');
    expect(detectDelimiter('just one column')).toBe(',');
    expect(parseCsv('a;b\n1;2').rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('honours an explicit delimiter and keeps a final line without newline', () => {
    expect(parseCsv('a,b;c\nd,e;f', ';').rows).toEqual([
      ['a,b', 'c'],
      ['d,e', 'f'],
    ]);
  });
});

describe('column mapping guesses', () => {
  it('maps English and Spanish headers, field labels and keys, once each', () => {
    expect(normaliseHeader('  Teléfono  Móvil ')).toBe('telefono movil');
    expect(
      guessMapping(
        [
          'Correo electrónico',
          'Cargo',
          'Teléfono',
          'Móvil',
          'Departamento',
          'Grupo',
          'Nombre',
          'Apellidos',
          'Employee ID',
          'E-mail',
          'Notes',
        ],
        FIELDS,
      ),
    ).toEqual([
      'email',
      'field:job_title',
      'field:phone',
      'field:mobile',
      'field:department',
      'group',
      'user:first_name',
      'user:last_name',
      'field:employee_id',
      '', // second email column
      '',
    ]);
  });
});

describe('chunking and merging', () => {
  it('chunks by 100 and folds results', () => {
    expect(chunk(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length)).toEqual([
      100, 100, 50,
    ]);

    const a: ImportChunkResult = {
      ...emptyImportResult(true),
      rows: 100,
      matched: 90,
      unknown: ['x@a.com'],
      unknown_count: 1,
      invalid: [{ row: 0, message: 'Bad role' }],
      field_changes: 40,
      groups_created: ['Sales'],
    };
    const b: ImportChunkResult = {
      ...emptyImportResult(true),
      rows: 50,
      matched: 48,
      unknown: ['y@a.com'],
      unknown_count: 2,
      invalid: [
        { row: 0, message: 'Bad role' },
        { row: 120, message: 'Invalid email' },
      ],
      field_changes: 2,
      groups_created: ['Sales', 'Legal'],
    };
    const total = mergeImportResults(mergeImportResults(emptyImportResult(true), a), b);
    expect(total.rows).toBe(150);
    expect(total.matched).toBe(138);
    expect(total.unknown).toEqual(['x@a.com', 'y@a.com']);
    expect(total.unknown_count).toBe(3);
    expect(total.invalid).toEqual([
      { row: 0, message: 'Bad role' },
      { row: 120, message: 'Invalid email' },
    ]);
    expect(total.field_changes).toBe(42);
    expect(total.groups_created).toEqual(['Sales', 'Legal']);
  });
});

describe('ImportTab', () => {
  const API = 'http://localhost/wp-json/imagina-signatures/v1';
  let posts: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    posts = [];
    (globalThis as unknown as { IMGSIG_ADMIN_CONFIG: unknown }).IMGSIG_ADMIN_CONFIG = {
      page: 'groups',
      userId: 1,
      capabilities: { use: true, manage_templates: true, manage_storage: true, manage_team: true },
      apiBase: API,
      restNonce: 'n',
      locale: 'en_US',
      wpAdminUrl: '',
      urls: { signatures: '', templates: '', settings: '', editor: '' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit = {}) => {
        if (init.method === 'POST') {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          posts.push(body);
          const rows = (body.rows as unknown[]).length;
          return new Response(
            JSON.stringify({
              ...emptyImportResult(Boolean(body.dry_run)),
              rows,
              matched: rows,
              field_changes: rows,
              users_changed: rows,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            fields: [
              {
                key: 'job_title',
                label: 'Job title',
                type: 'text',
                custom: false,
                source: 'plugin',
                meta_key: '',
              },
              {
                key: 'phone',
                label: 'Phone',
                type: 'phone',
                custom: false,
                source: 'meta',
                meta_key: 'billing_phone',
              },
            ],
            roles: [{ slug: 'subscriber', label: 'Subscriber' }],
            max_rows: 100,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as unknown as { IMGSIG_ADMIN_CONFIG?: unknown }).IMGSIG_ADMIN_CONFIG;
  });

  it('previews, maps, dry-runs and applies in chunks of 100', async () => {
    const lines = ['Email;Cargo;Teléfono;Grupo'];
    for (let i = 0; i < 150; i++) lines.push(`user${i}@acme.com;Rep ${i};+34 600;Sales`);
    const file = new File([lines.join('\n')], 'staff.csv', { type: 'text/csv' });

    render(<ImportTab />);
    fireEvent.change(await screen.findByTestId('csv-input'), { target: { files: [file] } });

    expect(await screen.findByText('staff.csv — 150 data rows')).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox', { name: /maps to/i }) as HTMLSelectElement[];
    expect(selects.map((s) => s.value)).toEqual(['email', 'field:job_title', '', 'group']);
    // Phone is synced from another meta key: offered but disabled.
    const phoneOption = within(selects[2]!).getByRole('option', { name: /Phone \(synced/ });
    expect(phoneOption).toBeDisabled();

    const apply = screen.getByRole('button', { name: /import 150 rows/i });
    expect(apply).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /dry run/i }));
    const summary = await screen.findByTestId('import-summary');
    expect(within(summary).getByText(/nothing was changed/i)).toBeInTheDocument();
    expect(posts).toHaveLength(2);
    expect(posts.map((p) => (p.rows as unknown[]).length)).toEqual([100, 50]);
    expect(posts.map((p) => p.row_offset)).toEqual([1, 101]);
    expect(posts[0]!.dry_run).toBe(true);
    expect(posts[0]!.columns).toEqual(['email', 'field:job_title', '', 'group']);
    expect(posts[0]!.options).toEqual({
      create_groups: true,
      create_missing: false,
      role: 'subscriber',
      send_notification: false,
    });

    await waitFor(() => expect(apply).toBeEnabled());
    fireEvent.click(apply);
    expect(await screen.findByText('Import finished')).toBeInTheDocument();
    expect(posts).toHaveLength(4);
    expect(posts[2]!.dry_run).toBe(false);
    expect(within(screen.getByTestId('import-summary')).getAllByText('150').length).toBeGreaterThan(
      0,
    );
  });

  it('requires exactly one email column', async () => {
    const file = new File(['Name,Title\nAna,CEO'], 'x.csv', { type: 'text/csv' });
    render(<ImportTab />);
    fireEvent.change(await screen.findByTestId('csv-input'), { target: { files: [file] } });

    expect(await screen.findByText(/Map exactly one column/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dry run/i })).toBeDisabled();
  });
});
