/**
 * CSV helpers for the profile import: parsing (RFC 4180 quoting,
 * delimiter detection), column-mapping guesses and result merging.
 * Pure functions — the import tab owns the UI and the REST calls.
 */

// i18n-ignore-file — header synonyms below are matched, never displayed.

import type { ImportChunkResult } from '@admin/directoryTypes';

export const CSV_DELIMITERS = [',', ';', '\t', '|'] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export interface ParsedCsv {
  delimiter: CsvDelimiter;
  rows: string[][];
}

/** Rows per POST /admin/profiles/import (server maximum). */
export const IMPORT_CHUNK_SIZE = 100;

/** Most entries a merged result keeps per list (counts stay exact). */
const MAX_LISTED = 200;

/**
 * Splits CSV text into rows of cells. Handles quoted cells with embedded
 * delimiters, newlines and doubled quotes, CRLF / LF / CR line endings
 * and a leading BOM. Blank lines are dropped.
 */
export function parseCsv(text: string, delimiter?: CsvDelimiter): ParsedCsv {
  const source = text.replace(/^\uFEFF/, '');
  const sep = delimiter ?? detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const endRow = (): void => {
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    cell = '';
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      endRow();
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) endRow();

  return { delimiter: sep, rows };
}

/**
 * The delimiter that splits the first lines most consistently (same
 * non-zero count on every line wins; quoted text is ignored). Comma
 * when nothing stands out.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim() !== '')
    .slice(0, 10)
    .map((l) => l.replace(/"(?:[^"]|"")*"/g, '""'));
  if (lines.length === 0) return ',';

  let best: CsvDelimiter = ',';
  let bestScore = 0;
  for (const sep of CSV_DELIMITERS) {
    const counts = lines.map((l) => l.split(sep).length - 1);
    const min = Math.min(...counts);
    if (min === 0) continue;
    const consistent = counts.every((c) => c === counts[0]);
    const score = consistent ? min * 10 : min;
    if (score > bestScore) {
      best = sep;
      bestScore = score;
    }
  }
  return best;
}

/** Lower-case, accent-free, single-spaced alphanumerics. */
export function normaliseHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Column targets the server understands, keyed by normalised header synonyms. */
const SYNONYMS: Record<string, string[]> = {
  email: ['email', 'e mail', 'mail', 'email address', 'correo', 'correo electronico', 'work email'],
  group: ['group', 'groups', 'grupo', 'grupos', 'team', 'equipo'],
  'field:job_title': ['job title', 'title', 'position', 'role title', 'cargo', 'puesto'],
  'field:department': ['department', 'dept', 'departamento', 'area'],
  'field:phone': ['phone', 'telephone', 'work phone', 'office phone', 'telefono', 'tel'],
  'field:mobile': ['mobile', 'mobile phone', 'cell', 'cell phone', 'movil', 'celular'],
  'field:photo_url': ['photo', 'photo url', 'picture', 'avatar', 'foto'],
  'field:linkedin_url': ['linkedin', 'linkedin url', 'linkedin profile'],
  'field:calendar_url': [
    'calendar',
    'calendar url',
    'booking',
    'booking url',
    'calendly',
    'agenda',
  ],
  'field:website_url': ['website', 'web', 'site', 'personal website', 'sitio web', 'pagina web'],
  'field:address_line': ['address', 'office', 'office address', 'direccion', 'oficina'],
  'field:pronouns': ['pronouns', 'pronombres'],
  'user:first_name': ['first name', 'firstname', 'given name', 'nombre'],
  'user:last_name': ['last name', 'lastname', 'surname', 'family name', 'apellido', 'apellidos'],
  'user:display_name': ['display name', 'full name', 'name', 'nombre completo'],
};

/**
 * Best target for one header: a known synonym, or a profile field whose
 * key or label matches. '' (ignore) otherwise.
 */
export function guessTarget(
  header: string,
  fields: ReadonlyArray<{ key: string; label: string }>,
): string {
  const h = normaliseHeader(header);
  if (h === '') return '';
  for (const [target, words] of Object.entries(SYNONYMS)) {
    if (words.includes(h)) return target;
  }
  for (const field of fields) {
    if (h === normaliseHeader(field.key) || h === normaliseHeader(field.label)) {
      return `field:${field.key}`;
    }
  }
  return '';
}

/** One target per header; each target is used at most once (first column wins). */
export function guessMapping(
  headers: readonly string[],
  fields: ReadonlyArray<{ key: string; label: string }>,
): string[] {
  const used = new Set<string>();
  return headers.map((header) => {
    const target = guessTarget(header, fields);
    if (target === '' || used.has(target)) return '';
    used.add(target);
    return target;
  });
}

/** Splits `items` into chunks of `size`. */
export function chunk<T>(items: readonly T[], size = IMPORT_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** An all-zero result to fold chunk results into. */
export function emptyImportResult(dryRun: boolean): ImportChunkResult {
  return {
    dry_run: dryRun,
    rows: 0,
    matched: 0,
    created: 0,
    unknown: [],
    unknown_count: 0,
    invalid: [],
    users_changed: 0,
    field_changes: 0,
    group_assignments: 0,
    groups_created: [],
    groups_missing: [],
    skipped_fields: [],
  };
}

/** Folds one chunk's result into the running total. */
export function mergeImportResults(
  total: ImportChunkResult,
  next: ImportChunkResult,
): ImportChunkResult {
  const unique = (a: string[], b: string[]): string[] =>
    Array.from(new Set([...a, ...b])).slice(0, MAX_LISTED);
  return {
    dry_run: total.dry_run,
    rows: total.rows + next.rows,
    matched: total.matched + next.matched,
    created: total.created + next.created,
    unknown: [...total.unknown, ...next.unknown].slice(0, MAX_LISTED),
    unknown_count: total.unknown_count + next.unknown_count,
    // Chunk-level problems (row 0, e.g. an invalid role) repeat per chunk: keep one.
    invalid: [
      ...total.invalid,
      ...next.invalid.filter(
        (item) =>
          item.row > 0 || !total.invalid.some((t) => t.row === 0 && t.message === item.message),
      ),
    ].slice(0, MAX_LISTED),
    users_changed: total.users_changed + next.users_changed,
    field_changes: total.field_changes + next.field_changes,
    group_assignments: total.group_assignments + next.group_assignments,
    groups_created: unique(total.groups_created, next.groups_created),
    groups_missing: unique(total.groups_missing, next.groups_missing),
    skipped_fields: unique(total.skipped_fields, next.skipped_fields),
  };
}
