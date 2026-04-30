import type { SignatureSchema } from './signature';

/**
 * Coarse-grained shape validator — equivalent to the PHP
 * {@link \ImaginaSignatures\Services\JsonSchemaValidator} (CLAUDE.md §8.2).
 *
 * Checks the same minimum invariants both sides of the wire enforce
 * so the editor and the REST layer never disagree on what's valid.
 *
 * Returns the errors array (empty on success) — callers throw or
 * surface as they see fit.
 */
export interface ValidationError {
  path: string;
  message: string;
}

export const SUPPORTED_VERSION = '1.0';

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

  if (data.schema_version !== undefined && data.schema_version !== SUPPORTED_VERSION) {
    errors.push({
      path: 'schema_version',
      message: `Unsupported schema version "${String(data.schema_version)}" (expected "${SUPPORTED_VERSION}").`,
    });
  }

  if (data.canvas !== undefined && !isPlainObject(data.canvas)) {
    errors.push({ path: 'canvas', message: 'canvas must be an object.' });
  }

  if (data.variables !== undefined && !isPlainObject(data.variables)) {
    errors.push({ path: 'variables', message: 'variables must be an object.' });
  }

  if (data.blocks !== undefined) {
    if (!Array.isArray(data.blocks)) {
      errors.push({ path: 'blocks', message: 'blocks must be an array.' });
    } else {
      data.blocks.forEach((block, index) => {
        const path = `blocks[${index}]`;
        if (!isPlainObject(block)) {
          errors.push({ path, message: 'Block must be an object.' });
          return;
        }
        const b = block as Record<string, unknown>;
        if (typeof b.id !== 'string' || b.id.length === 0) {
          errors.push({ path: `${path}.id`, message: 'Block must carry a non-empty string id.' });
        }
        if (typeof b.type !== 'string' || b.type.length === 0) {
          errors.push({ path: `${path}.type`, message: 'Block must carry a non-empty string type.' });
        }
      });
    }
  }

  return errors;
}

export function isValidSchema(value: unknown): value is SignatureSchema {
  return validateSchema(value).length === 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
