import { useEffect, useMemo, useState, type FC } from 'react';
import { FileUp, PlayCircle, SearchCheck, X } from 'lucide-react';
import { Button } from '@admin/components/Button';
import { Spinner } from '@admin/components/Spinner';
import { apiCall, ApiError } from '@admin/api';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';
import { Banner, Field, Section, type Flash } from '@admin/pages/settings/_shared';
import type { ImportChunkResult } from '@admin/directoryTypes';
import type { ProfileFieldAdminDefinition } from '@shared/profileFields';
import {
  CSV_DELIMITERS,
  IMPORT_CHUNK_SIZE,
  chunk,
  emptyImportResult,
  guessMapping,
  mergeImportResults,
  parseCsv,
  type CsvDelimiter,
} from './csv';

interface ImportMeta {
  fields: ProfileFieldAdminDefinition[];
  roles: Array<{ slug: string; label: string }>;
  max_rows: number;
}

interface LoadedFile {
  name: string;
  text: string;
}

const PREVIEW_ROWS = 5;

const DELIMITER_LABELS: Record<CsvDelimiter, () => string> = {
  ',': () => __('Comma'),
  ';': () => __('Semicolon'),
  '\t': () => __('Tab'),
  '|': () => __('Pipe'),
};

/**
 * CSV profile import: upload → preview + column mapping → dry run →
 * apply, in chunks of {@link IMPORT_CHUNK_SIZE} rows through
 * `POST /admin/profiles/import`. Parsing happens here; the server
 * validates, matches users by email and applies the profile fields and
 * group memberships.
 */
export const ImportTab: FC = () => {
  const [meta, setMeta] = useState<ImportMeta | null>(null);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [delimiter, setDelimiter] = useState<CsvDelimiter | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [columns, setColumns] = useState<string[]>([]);
  const [createGroups, setCreateGroups] = useState(true);
  const [createUsers, setCreateUsers] = useState(false);
  const [role, setRole] = useState('');
  const [notify, setNotify] = useState(false);
  const [running, setRunning] = useState<null | { dryRun: boolean; done: number; total: number }>(
    null,
  );
  const [dryResult, setDryResult] = useState<ImportChunkResult | null>(null);
  const [applyResult, setApplyResult] = useState<ImportChunkResult | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    void apiCall<ImportMeta>('/admin/profiles/import')
      .then((m) => {
        setMeta(m);
        setRole(m.roles.find((r) => r.slug === 'subscriber')?.slug ?? m.roles[0]?.slug ?? '');
      })
      .catch((e: Error) => setFlash({ type: 'error', message: e.message }));
  }, []);

  const parsed = useMemo(
    () => (file ? parseCsv(file.text, delimiter ?? undefined) : null),
    [file, delimiter],
  );
  const width = parsed ? Math.max(0, ...parsed.rows.map((r) => r.length)) : 0;
  const headers = useMemo(() => {
    if (!parsed || parsed.rows.length === 0) return [];
    const first = parsed.rows[0] ?? [];
    return Array.from({ length: width }, (_, i) =>
      hasHeader ? (first[i] ?? '') : __('Column %s', String(i + 1)),
    );
  }, [parsed, hasHeader, width]);
  const dataRows = useMemo(
    () => (parsed ? (hasHeader ? parsed.rows.slice(1) : parsed.rows) : []),
    [parsed, hasHeader],
  );

  // Re-guess the mapping whenever the file / header option changes.
  useEffect(() => {
    if (!meta || headers.length === 0) {
      setColumns([]);
      return;
    }
    // Fields synced from another meta key can't be imported: never pre-select them.
    const writable = new Set(
      meta.fields.filter((f) => f.source !== 'meta').map((f) => `field:${f.key}`),
    );
    setColumns(
      hasHeader
        ? guessMapping(headers, meta.fields).map((t) =>
            t.startsWith('field:') && !writable.has(t) ? '' : t,
          )
        : headers.map(() => ''),
    );
  }, [headers, hasHeader, meta]);

  // Any change to what would be imported invalidates the last dry run.
  useEffect(() => {
    setDryResult(null);
    setApplyResult(null);
  }, [file, delimiter, hasHeader, columns, createGroups, createUsers, role, notify]);

  const emailColumns = columns.filter((c) => c === 'email').length;
  const mappingError =
    file && emailColumns !== 1 ? __('Map exactly one column to “Email address”.') : null;

  const onFile = async (picked: File | undefined): Promise<void> => {
    if (!picked) return;
    setFlash(null);
    try {
      const text = await readText(picked);
      setDelimiter(null);
      setFile({ name: picked.name, text });
    } catch {
      setFlash({ type: 'error', message: __('The file could not be read.') });
    }
  };

  const run = async (dryRun: boolean): Promise<void> => {
    if (!parsed || mappingError) return;
    const chunks = chunk(dataRows, meta?.max_rows ?? IMPORT_CHUNK_SIZE);
    let total = emptyImportResult(dryRun);
    setFlash(null);
    setRunning({ dryRun, done: 0, total: dataRows.length });
    try {
      for (const [index, rows] of chunks.entries()) {
        const result = await apiCall<ImportChunkResult>('/admin/profiles/import', {
          method: 'POST',
          body: {
            rows,
            columns,
            dry_run: dryRun,
            // Server row numbers then match the line numbers of the file.
            row_offset: index * IMPORT_CHUNK_SIZE + (hasHeader ? 1 : 0),
            options: {
              create_groups: createGroups,
              create_missing: createUsers,
              role,
              send_notification: createUsers && notify,
            },
          },
        });
        total = mergeImportResults(total, result);
        setRunning({
          dryRun,
          done: Math.min(dataRows.length, (index + 1) * IMPORT_CHUNK_SIZE),
          total: dataRows.length,
        });
      }
      if (dryRun) setDryResult(total);
      else setApplyResult(total);
    } catch (e) {
      // Keep what the finished chunks did visible.
      if (dryRun) setDryResult(null);
      else setApplyResult(total);
      setFlash({
        type: 'error',
        message: e instanceof ApiError ? e.message : (e as Error).message,
      });
    } finally {
      setRunning(null);
    }
  };

  const targetOptions = useMemo(() => buildTargetOptions(meta?.fields ?? []), [meta]);

  return (
    <div className="space-y-4">
      {flash && (
        <Banner type={flash.type} message={flash.message} onDismiss={() => setFlash(null)} />
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]">
        <Section
          title={__('Import profiles from a CSV file')}
          description={__(
            'One row per employee, matched by email address. Empty cells never erase existing values. Run a dry run first to see what would change.',
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg-panel-soft)] px-4 py-3 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              <FileUp size={16} />
              {file ? __('Choose another file') : __('Choose a CSV file')}
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                data-testid="csv-input"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            {file && parsed && (
              <span className="text-[12px] text-[var(--text-secondary)]">
                {__('%1$s — %2$s data rows', file.name, String(dataRows.length))}
              </span>
            )}
            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                title={__('Remove file')}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {parsed && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label={__('Delimiter')}
                hint={__('Detected automatically; change it if the columns look wrong.')}
              >
                <select
                  value={parsed.delimiter}
                  onChange={(e) => setDelimiter(e.target.value as CsvDelimiter)}
                >
                  {CSV_DELIMITERS.map((d) => (
                    <option key={d} value={d}>
                      {DELIMITER_LABELS[d]()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={__('Header row')}>
                <label className="inline-flex cursor-pointer items-center gap-2 py-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(e) => setHasHeader(e.target.checked)}
                    className="!h-4 !w-4 !p-0"
                  />
                  <span className="text-[var(--text-secondary)]">
                    {__('The first row contains column names')}
                  </span>
                </label>
              </Field>
            </div>
          )}
        </Section>

        {parsed && headers.length > 0 && (
          <Section
            title={__('Columns')}
            description={__('Choose what each column contains. Unmapped columns are ignored.')}
          >
            <div className="overflow-x-auto rounded-md border border-[var(--border-default)]">
              <table className="min-w-full text-left text-[12px]">
                <thead className="bg-[var(--bg-panel-soft)]">
                  <tr>
                    {headers.map((header, i) => (
                      <th
                        key={i}
                        className="min-w-[170px] border-b border-[var(--border-default)] p-2 align-top font-medium"
                      >
                        <span className="mb-1 block truncate text-[var(--text-primary)]">
                          {header || __('Column %s', String(i + 1))}
                        </span>
                        <select
                          aria-label={__('Column %s maps to', String(i + 1))}
                          value={columns[i] ?? ''}
                          onChange={(e) =>
                            setColumns((prev) => prev.map((c, j) => (j === i ? e.target.value : c)))
                          }
                          className={cn(
                            '!py-1 text-[12px]',
                            columns[i] && '!border-[var(--accent)]',
                          )}
                        >
                          {targetOptions.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                              {group.options.map((o) => (
                                <option key={o.value} value={o.value} disabled={o.disabled}>
                                  {o.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.slice(0, PREVIEW_ROWS).map((row, r) => (
                    <tr key={r} className="border-b border-[var(--border-default)] last:border-b-0">
                      {headers.map((_, c) => (
                        <td
                          key={c}
                          className="max-w-[220px] truncate p-2 text-[var(--text-secondary)]"
                        >
                          {row[c] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dataRows.length > PREVIEW_ROWS && (
              <p className="text-[11px] text-[var(--text-muted)]">
                {__(
                  'Showing the first %1$s of %2$s rows.',
                  String(PREVIEW_ROWS),
                  String(dataRows.length),
                )}
              </p>
            )}
            {mappingError && <p className="text-[12px] text-[var(--danger)]">{mappingError}</p>}
          </Section>
        )}

        {parsed && headers.length > 0 && (
          <Section title={__('Options')}>
            <label className="flex cursor-pointer items-start gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={createGroups}
                onChange={(e) => setCreateGroups(e.target.checked)}
                className="mt-0.5 !h-4 !w-4 !p-0"
              />
              <span className="text-[var(--text-secondary)]">
                {__('Create groups that do not exist yet')}
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={createUsers}
                onChange={(e) => setCreateUsers(e.target.checked)}
                className="mt-0.5 !h-4 !w-4 !p-0"
                disabled={!meta || meta.roles.length === 0}
              />
              <span className="text-[var(--text-secondary)]">
                {__('Create a WordPress user for unknown email addresses')}
              </span>
            </label>
            {createUsers && meta && (
              <div className="ml-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label={__('Role for new users')}
                  hint={__('Administrative roles are not offered.')}
                >
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    {meta.roles.map((r) => (
                      <option key={r.slug} value={r.slug}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={__('Welcome email')}>
                  <label className="inline-flex cursor-pointer items-center gap-2 py-2 text-[12.5px]">
                    <input
                      type="checkbox"
                      checked={notify}
                      onChange={(e) => setNotify(e.target.checked)}
                      className="!h-4 !w-4 !p-0"
                    />
                    <span className="text-[var(--text-secondary)]">
                      {__('Send new users the WordPress account email')}
                    </span>
                  </label>
                </Field>
              </div>
            )}
          </Section>
        )}

        {parsed && headers.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-default)] bg-[var(--bg-panel-soft)] px-5 py-4">
            {running && (
              <span className="mr-auto inline-flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                <Spinner size={12} />
                {__('%1$s of %2$s rows…', String(running.done), String(running.total))}
              </span>
            )}
            <Button
              variant="secondary"
              disabled={!!running || !!mappingError || dataRows.length === 0}
              icon={<SearchCheck size={14} />}
              onClick={() => void run(true)}
            >
              {__('Dry run')}
            </Button>
            <Button
              variant="primary"
              disabled={!!running || !!mappingError || !dryResult || !!applyResult}
              icon={<PlayCircle size={14} />}
              onClick={() => void run(false)}
              title={dryResult ? undefined : __('Run a dry run first.')}
            >
              {__('Import %s rows', String(dataRows.length))}
            </Button>
          </div>
        )}
      </div>

      {applyResult && <ImportSummary result={applyResult} />}
      {!applyResult && dryResult && <ImportSummary result={dryResult} />}
    </div>
  );
};

/** File contents as text (FileReader where Blob#text is missing). */
function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

interface TargetOption {
  value: string;
  label: string;
  disabled?: boolean;
}

function buildTargetOptions(
  fields: ProfileFieldAdminDefinition[],
): Array<{ label: string; options: TargetOption[] }> {
  return [
    {
      label: __('Basics'),
      options: [
        { value: '', label: __('— Ignore —') },
        { value: 'email', label: __('Email address') },
        { value: 'group', label: __('Groups (separate several with |)') },
      ],
    },
    {
      label: __('Profile fields'),
      options: fields.map((f) => ({
        value: `field:${f.key}`,
        label: f.source === 'meta' ? __('%s (synced, skipped)', f.label) : f.label,
        disabled: f.source === 'meta',
      })),
    },
    {
      label: __('New users only'),
      options: [
        { value: 'user:first_name', label: __('First name') },
        { value: 'user:last_name', label: __('Last name') },
        { value: 'user:display_name', label: __('Display name') },
      ],
    },
  ];
}

export const ImportSummary: FC<{ result: ImportChunkResult }> = ({ result }) => {
  const stats: Array<{ label: string; value: number; tone?: 'warn' }> = [
    { label: __('Rows read'), value: result.rows },
    { label: __('Users matched'), value: result.matched },
    {
      label: result.dry_run ? __('Users to create') : __('Users created'),
      value: result.created,
    },
    { label: __('Unknown emails'), value: result.unknown_count, tone: 'warn' },
    { label: __('Invalid rows'), value: result.invalid.length, tone: 'warn' },
    {
      label: result.dry_run ? __('Users that would change') : __('Users updated'),
      value: result.users_changed,
    },
    {
      label: result.dry_run ? __('Field values to change') : __('Field values changed'),
      value: result.field_changes,
    },
    {
      label: result.dry_run ? __('Group memberships to add') : __('Group memberships added'),
      value: result.group_assignments,
    },
  ];

  return (
    <div
      className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-[var(--shadow-xs)]"
      data-testid="import-summary"
    >
      <Section title={result.dry_run ? __('Dry run — nothing was changed') : __('Import finished')}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-md bg-[var(--bg-panel-soft)] px-3 py-2">
              <dt className="text-[11px] text-[var(--text-muted)]">{s.label}</dt>
              <dd
                className={cn(
                  'text-[18px] font-semibold tabular-nums text-[var(--text-primary)]',
                  s.tone === 'warn' && s.value > 0 && 'text-amber-700',
                )}
              >
                {s.value}
              </dd>
            </div>
          ))}
        </dl>

        {result.groups_created.length > 0 && (
          <p className="text-[12px] text-[var(--text-secondary)]">
            {result.dry_run
              ? __('Groups to create: %s', result.groups_created.join(', '))
              : __('Groups created: %s', result.groups_created.join(', '))}
          </p>
        )}
        {result.groups_missing.length > 0 && (
          <p className="text-[12px] text-amber-700">
            {__('Groups not found (not assigned): %s', result.groups_missing.join(', '))}
          </p>
        )}
        {result.skipped_fields.length > 0 && (
          <p className="text-[12px] text-[var(--text-secondary)]">
            {__('Skipped columns synced from another source: %s', result.skipped_fields.join(', '))}
          </p>
        )}
        {result.unknown.length > 0 && (
          <details className="text-[12px]">
            <summary className="cursor-pointer text-[var(--text-secondary)]">
              {__('Unknown email addresses (%s)', String(result.unknown_count))}
            </summary>
            <p className="mt-1 break-words font-mono text-[11px] text-[var(--text-muted)]">
              {result.unknown.join(', ')}
            </p>
          </details>
        )}
        {result.invalid.length > 0 && (
          <details className="text-[12px]" open>
            <summary className="cursor-pointer text-[var(--text-secondary)]">
              {__('Rows with problems (%s)', String(result.invalid.length))}
            </summary>
            <ul className="mt-1 space-y-0.5 text-[11.5px] text-[var(--text-muted)]">
              {result.invalid.map((item, i) => (
                <li key={i}>
                  {item.row > 0
                    ? __('Line %1$s: %2$s', String(item.row), item.message)
                    : item.message}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>
    </div>
  );
};
