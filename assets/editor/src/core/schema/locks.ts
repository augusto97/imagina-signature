import type { Block } from './blocks';
import type { BlockOverride, EmployeeMode, SignatureSchema } from './signature';
import { migrateSchema } from './migrate';
import { childLists, walkBlocks } from './tree';
import { variableTokenNames } from '@/core/compiler/variables';

/**
 * Block locks and template employee modes (1.3.0) — pure helpers shared
 * by the store guards, the canvas chrome, the Layers panel and the
 * sidebars. Mirrors `src/Services/TemplateLink.php`, which enforces the
 * same rules on save.
 *
 * Restrictions apply only when the editor user can't bypass locks and
 * the signature follows a template (`link.mode === 'linked'`) or its
 * template declares a non-`free` employee mode:
 *
 *  - every mode: locked blocks (and everything inside a locked
 *    container) can't be edited, moved, duplicated or deleted;
 *  - `locked_design`: nothing can be added, moved or removed, the canvas
 *    is fixed, and only the text of unlocked text-like blocks changes;
 *  - `fields_only`: only the signature's variables change (the editor
 *    shows the "Your details" form instead of the canvas tools).
 */

/** Link state of the signature being edited (`IMGSIG_EDITOR_CONFIG.signatureLink`). */
export interface LinkContext {
  mode: 'linked' | 'detached';
  templateId: number | null;
  employeeMode: EmployeeMode;
  templateName: string;
  /** Template / team managers ignore every restriction. */
  canBypassLocks: boolean;
}

/** What the current user may do, derived from a {@link LinkContext}. */
export interface EditPolicy {
  /** Any restriction applies. */
  enforced: boolean;
  /** The design follows a template (overrides are recorded). */
  linked: boolean;
  /** The template's employee mode. */
  employeeMode: EmployeeMode;
  /** No block may be added, moved, duplicated or deleted. */
  structureLocked: boolean;
  /** Canvas settings (width, fonts, colours) are read-only. */
  canvasLocked: boolean;
  /** `fields_only`: the user only fills in their details. */
  fieldsOnly: boolean;
  /** The user may convert the signature into a free copy. */
  canDetach: boolean;
}

/** Text fields an employee may change, per text-like block type. */
export const OVERRIDE_FIELDS: Readonly<Record<string, ReadonlyArray<keyof BlockOverride>>> = {
  text: ['content'],
  heading: ['content', 'content_html'],
  disclaimer: ['content', 'content_html'],
};

/** Whether blocks of `type` carry employee-editable text. */
export function isTextLikeType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(OVERRIDE_FIELDS, type);
}

/** The {@link EditPolicy} for a link state. */
export function editPolicy(link: LinkContext): EditPolicy {
  const linked = link.mode === 'linked';
  const enforced = !link.canBypassLocks && (linked || link.employeeMode !== 'free');
  const restrictive = enforced && link.employeeMode !== 'free';
  return {
    enforced,
    linked,
    employeeMode: link.employeeMode,
    structureLocked: restrictive,
    canvasLocked: restrictive,
    fieldsOnly: enforced && link.employeeMode === 'fields_only',
    canDetach: linked && (link.canBypassLocks || link.employeeMode === 'free'),
  };
}

/**
 * Ids of every locked block: blocks with `locked: true` and everything
 * inside a locked container.
 */
export function lockedBlockIds(blocks: Block[]): ReadonlySet<string> {
  // Every block's chrome asks on each render: compute once per tree
  // (immer gives a changed tree a new array).
  const cached = lockedCache.get(blocks);
  if (cached) return cached;
  const ids = new Set<string>();
  const visit = (list: Block[], inherited: boolean): void => {
    for (const block of list) {
      if (!block) continue;
      const locked = inherited || block.locked === true;
      if (locked) ids.add(block.id);
      for (const children of childLists(block)) visit(children, locked);
    }
  };
  visit(blocks, false);
  lockedCache.set(blocks, ids);
  return ids;
}

const lockedCache = new WeakMap<Block[], ReadonlySet<string>>();

/** Whether block `id` is locked, itself or through an ancestor container. */
export function isBlockLocked(blocks: Block[], id: string): boolean {
  return lockedBlockIds(blocks).has(id);
}

/** Whether `block` or anything inside it is locked. */
export function subtreeHasLock(block: Block): boolean {
  let found = false;
  walkBlocks([block], (b) => {
    if (b.locked === true) found = true;
    return !found;
  });
  return found;
}

/**
 * Fields of `block` the user may change: `'all'`, or the list of
 * allowed keys (possibly empty).
 */
export function editableFields(
  policy: EditPolicy,
  block: Block,
  locked: boolean,
): 'all' | ReadonlyArray<string> {
  if (!policy.enforced) return 'all';
  if (locked || policy.fieldsOnly) return [];
  if (policy.employeeMode === 'locked_design') {
    return OVERRIDE_FIELDS[block.type] ?? [];
  }
  return 'all';
}

/** Whether the property panel should offer anything editable for `block`. */
export function canEditBlock(policy: EditPolicy, block: Block, locked: boolean): boolean {
  const fields = editableFields(policy, block, locked);
  return fields === 'all' || fields.length > 0;
}

/** Whether `block` may be moved, duplicated or deleted. */
export function canRestructureBlock(policy: EditPolicy, locked: boolean): boolean {
  if (!policy.enforced) return true;
  return !policy.structureLocked && !locked;
}

/**
 * Records the text of a linked signature's unlocked text-like block as
 * an override (mutates `schema`; safe inside an immer producer).
 */
export function recordOverride(schema: SignatureSchema, block: Block): void {
  const fields = OVERRIDE_FIELDS[block.type];
  if (!fields) return;
  const source = block as unknown as Record<string, unknown>;
  const entry: BlockOverride = {};
  for (const field of fields) {
    const value = source[field];
    if (typeof value === 'string') entry[field] = value;
  }
  if (Object.keys(entry).length === 0) return;
  if (!isPlainObject(schema.overrides)) schema.overrides = {};
  schema.overrides[block.id] = entry;
}

/**
 * The overrides that target an existing text-like block of `blocks`
 * (unlocked ones only, unless `includeLocked`), reduced to that block
 * type's string fields.
 */
export function applicableOverrides(
  overrides: unknown,
  blocks: Block[],
  includeLocked = false,
): Record<string, BlockOverride> {
  if (!isPlainObject(overrides)) return {};
  const locked = lockedBlockIds(blocks);
  const types = new Map<string, string>();
  walkBlocks(blocks, (block) => {
    if (!types.has(block.id)) types.set(block.id, block.type);
  });
  const out: Record<string, BlockOverride> = {};
  for (const [id, entry] of Object.entries(overrides)) {
    const fields = OVERRIDE_FIELDS[types.get(id) ?? ''];
    if (!fields || (!includeLocked && locked.has(id)) || !isPlainObject(entry)) continue;
    const picked: BlockOverride = {};
    for (const field of fields) {
      const value = (entry as Record<string, unknown>)[field];
      if (typeof value === 'string') picked[field] = value;
    }
    if (Object.keys(picked).length > 0) out[id] = picked;
  }
  return out;
}

/** Deep copy of `blocks` with `overrides` written into their blocks (any depth). */
export function applyOverrides(blocks: Block[], overrides: Record<string, BlockOverride>): Block[] {
  const copy = JSON.parse(JSON.stringify(blocks)) as Block[];
  if (Object.keys(overrides).length === 0) return copy;
  walkBlocks(copy, (block) => {
    const entry = overrides[block.id];
    if (entry) Object.assign(block, entry);
  });
  return copy;
}

/**
 * Client mirror of `TemplateLink::refresh()` (PHP): rebuilds a linked
 * signature from its template — the template's design, the signature's
 * variables over the template's defaults, its `meta`, and its text
 * overrides on unlocked text-like blocks (none in `fields_only`).
 * Inputs are not mutated. (1.0 templates get fresh column ids here; the
 * server derives them from the container id.)
 */
export function refreshFromTemplate(
  template: SignatureSchema,
  signature: Partial<Pick<SignatureSchema, 'variables' | 'meta' | 'overrides'>>,
): SignatureSchema {
  const out = migrateSchema(template);
  delete out.overrides;
  out.variables = { ...(out.variables ?? {}), ...(signature.variables ?? {}) };
  if (signature.meta && Object.keys(signature.meta).length > 0) out.meta = { ...signature.meta };
  const overrides =
    out.settings?.employee_mode === 'fields_only'
      ? {}
      : applicableOverrides(signature.overrides, out.blocks);
  out.blocks = applyOverrides(out.blocks, overrides);
  out.overrides = overrides;
  return out;
}

/**
 * The schema of a linked signature turned into a free copy: overrides
 * are already applied to their blocks, so the map is just dropped.
 * Returns a deep copy.
 */
export function detachedSchema(schema: SignatureSchema): SignatureSchema {
  const copy = JSON.parse(JSON.stringify(schema)) as SignatureSchema;
  delete copy.overrides;
  return copy;
}

/**
 * The template JSON for a canvas saved as a template: the employee mode
 * is stamped into `settings`, and a linked signature's text `overrides`
 * (they belong to that signature, not to the template) are dropped.
 * Returns a deep copy.
 */
export function templateJsonFor(schema: SignatureSchema, mode: EmployeeMode): SignatureSchema {
  const json = JSON.parse(JSON.stringify(schema)) as SignatureSchema;
  delete json.overrides;
  json.settings = { ...(json.settings ?? {}), employee_mode: mode };
  return json;
}

/**
 * Names of the `{{variables}}` the design uses, in order of first
 * appearance (blocks only — not the variables map itself).
 */
export function referencedVariables(schema: SignatureSchema): string[] {
  return variableTokenNames(JSON.stringify(schema.blocks ?? []));
}

function isPlainObject(value: unknown): value is Record<string, BlockOverride> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
