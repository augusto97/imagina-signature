// Browser-side schema validator. Mirrors the PHP JsonSchemaValidator.

import type { Block, SignatureSchema } from '@shared/types';

const ALLOWED_BLOCK_TYPES = [
  'text',
  'text_stack',
  'image',
  'divider',
  'spacer',
  'social_icons',
  'contact_row',
  'button_cta',
  'disclaimer',
  'container',
] as const;

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  schema?: SignatureSchema;
}

const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isColor(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value === 'transparent' || COLOR_RE.test(value);
}

function isSafeUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value, 'https://example.com');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function validateBlock(block: unknown, path: string, errors: ValidationError[]): void {
  if (typeof block !== 'object' || block === null) {
    errors.push({ path, message: 'Block must be an object' });
    return;
  }
  const b = block as Record<string, unknown>;

  if (typeof b.id !== 'string' || b.id === '') {
    errors.push({ path: `${path}.id`, message: 'Missing block id' });
  }
  if (typeof b.type !== 'string' || !(ALLOWED_BLOCK_TYPES as readonly string[]).includes(b.type)) {
    errors.push({ path: `${path}.type`, message: 'Invalid block type' });
    return;
  }

  switch (b.type) {
    case 'image':
      if (typeof b.src !== 'string') {
        errors.push({ path: `${path}.src`, message: 'Image block requires src' });
      } else if (!isSafeUrl(b.src)) {
        errors.push({ path: `${path}.src`, message: 'Image src must be http(s)' });
      }
      if (typeof b.alt !== 'string') {
        errors.push({ path: `${path}.alt`, message: 'Image block requires alt text' });
      }
      break;
    case 'social_icons':
      if (!Array.isArray(b.networks)) {
        errors.push({ path: `${path}.networks`, message: 'Networks must be an array' });
      }
      break;
    case 'button_cta':
      if (!isSafeUrl(b.url)) {
        errors.push({
          path: `${path}.url`,
          message: 'CTA url must be http(s)/mailto/tel',
        });
      }
      break;
    case 'container':
      if (Array.isArray(b.children)) {
        b.children.forEach((child, j) => {
          validateBlock(child, `${path}.children[${j}]`, errors);
        });
      }
      break;
    default:
      break;
  }
}

export function validateSignatureSchema(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: [{ path: '', message: 'Payload must be an object' }] };
  }
  const d = data as Record<string, unknown>;

  if (d.schema_version !== '1.0') {
    errors.push({ path: 'schema_version', message: 'Invalid or missing schema_version' });
  }

  const canvas = d.canvas;
  if (typeof canvas !== 'object' || canvas === null) {
    errors.push({ path: 'canvas', message: 'Missing canvas configuration' });
  } else {
    const c = canvas as Record<string, unknown>;
    if (typeof c.width !== 'number') {
      errors.push({ path: 'canvas.width', message: 'Width must be a number' });
    } else if (c.width < 320 || c.width > 800) {
      errors.push({ path: 'canvas.width', message: 'Width must be between 320 and 800' });
    }
    for (const key of ['background_color', 'text_color', 'link_color']) {
      if (c[key] !== undefined && !isColor(c[key])) {
        errors.push({ path: `canvas.${key}`, message: 'Invalid color' });
      }
    }
  }

  if (!Array.isArray(d.blocks)) {
    errors.push({ path: 'blocks', message: 'Missing blocks list' });
  } else {
    (d.blocks as Block[]).forEach((block, i) => validateBlock(block, `blocks[${i}]`, errors));
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, errors: [], schema: data as SignatureSchema };
}
