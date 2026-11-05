import { MAX_CONTAINER_COLUMNS } from './blocks';
import {
  CURRENT_SCHEMA_VERSION,
  EMPLOYEE_MODES,
  type SchemaVersion,
  type SignatureSchema,
} from './signature';

/**
 * Coarse-grained shape validator — equivalent to the PHP
 * {@link \ImaginaSignatures\Services\JsonSchemaValidator} (CLAUDE.md §8.2).
 *
 * Checks the same minimum invariants both sides of the wire enforce
 * so the editor and the REST layer never disagree on what's valid:
 * supported version, top-level keys, and an id + type on every block
 * at any depth — v2 `columns[].children` and the 1.0 `children` /
 * `right_children` lists alike — plus (1.3.0) a boolean `locked`, a
 * known `settings.employee_mode` and an object `overrides` map.
 *
 * Returns the errors array (empty on success) — callers throw or
 * surface as they see fit.
 */
export interface ValidationError {
  path: string;
  message: string;
}

/** Current schema version (what the editor writes). */
export const SUPPORTED_VERSION = CURRENT_SCHEMA_VERSION;

/** Every schema version the editor (and the REST layer) accepts. */
export const SUPPORTED_VERSIONS: readonly SchemaVersion[] = ['1.0', '1.1'];

const LEGACY_CHILD_KEYS = ['children', 'right_children'] as const;

export function validateSchema(value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isPlainObject(value)) {
    errors.push({ path: '', message: 'Schema must be an object.' });
    return errors;
  }

  const data = value as Record<string, unknown>;

  for (const key of ['schema_version', 'meta', 'canvas', 'blocks', 'variables']) {
    if (!(key in data)) {
      errors.push({ path: key, message: `Missing required key "${key}".` });
    }
  }

  if (
    data.schema_version !== undefined &&
    !(SUPPORTED_VERSIONS as readonly unknown[]).includes(data.schema_version)
  ) {
    errors.push({
      path: 'schema_version',
      message: `Unsupported schema version "${String(data.schema_version)}" (expected one of "${SUPPORTED_VERSIONS.join('", "')}").`,
    });
  }

  if (data.canvas !== undefined && !isPlainObject(data.canvas)) {
    errors.push({ path: 'canvas', message: 'canvas must be an object.' });
  }

  if (data.variables !== undefined && !isPlainObject(data.variables)) {
    errors.push({ path: 'variables', message: 'variables must be an object.' });
  }

  // 1.3.0: template employee mode + per-block text overrides.
  if (data.settings !== undefined) {
    if (!isPlainObject(data.settings)) {
      errors.push({ path: 'settings', message: 'settings must be an object.' });
    } else if (
      'employee_mode' in data.settings &&
      !(EMPLOYEE_MODES as readonly unknown[]).includes(data.settings.employee_mode)
    ) {
      errors.push({
        path: 'settings.employee_mode',
        message: `employee_mode must be one of "${EMPLOYEE_MODES.join('", "')}".`,
      });
    }
  }

  // PHP turns an empty `{}` into `[]`: accept both for an empty map.
  if (data.overrides !== undefined && !isEmptyArray(data.overrides)) {
    if (!isPlainObject(data.overrides)) {
      errors.push({ path: 'overrides', message: 'overrides must be an object.' });
    } else {
      for (const [blockId, fields] of Object.entries(data.overrides)) {
        if (!isPlainObject(fields)) {
          errors.push({ path: `overrides.${blockId}`, message: 'An override must be an object.' });
        }
      }
    }
  }

  if (data.blocks !== undefined) {
    if (!Array.isArray(data.blocks)) {
      errors.push({ path: 'blocks', message: 'blocks must be an array.' });
    } else {
      validateBlockList(data.blocks, 'blocks', errors);
    }
  }

  return errors;
}

function validateBlockList(list: unknown[], path: string, errors: ValidationError[]): void {
  list.forEach((block, index) => validateBlock(block, `${path}[${index}]`, errors));
}

function validateBlock(block: unknown, path: string, errors: ValidationError[]): void {
  if (!isPlainObject(block)) {
    errors.push({ path, message: 'Block must be an object.' });
    return;
  }
  if (typeof block.id !== 'string' || block.id.length === 0) {
    errors.push({ path: `${path}.id`, message: 'Block must carry a non-empty string id.' });
  }
  if (typeof block.type !== 'string' || block.type.length === 0) {
    errors.push({ path: `${path}.type`, message: 'Block must carry a non-empty string type.' });
  }
  if ('locked' in block && typeof block.locked !== 'boolean') {
    errors.push({ path: `${path}.locked`, message: 'locked must be a boolean.' });
  }

  if (Array.isArray(block.columns)) {
    if (block.columns.length > MAX_CONTAINER_COLUMNS) {
      errors.push({
        path: `${path}.columns`,
        message: `A container holds at most ${MAX_CONTAINER_COLUMNS} columns.`,
      });
    }
    block.columns.forEach((column, index) => {
      const columnPath = `${path}.columns[${index}]`;
      if (!isPlainObject(column)) {
        errors.push({ path: columnPath, message: 'Column must be an object.' });
        return;
      }
      if (column.children === undefined || column.children === null) return;
      if (!Array.isArray(column.children)) {
        errors.push({
          path: `${columnPath}.children`,
          message: 'children must be an array of blocks.',
        });
        return;
      }
      validateBlockList(column.children, `${columnPath}.children`, errors);
    });
  }

  for (const key of LEGACY_CHILD_KEYS) {
    const children = block[key];
    if (children === undefined || children === null) continue;
    if (!Array.isArray(children)) {
      errors.push({ path: `${path}.${key}`, message: `${key} must be an array of blocks.` });
      continue;
    }
    validateBlockList(children, `${path}.${key}`, errors);
  }
}

export function isValidSchema(value: unknown): value is SignatureSchema {
  return validateSchema(value).length === 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}
