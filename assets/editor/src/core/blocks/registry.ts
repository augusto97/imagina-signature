import type { FC } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Block, BlockBase } from '@/core/schema/blocks';

/**
 * Block category surfaces the block in the left-sidebar library.
 */
export type BlockCategory = 'content' | 'layout' | 'social';

/**
 * Compile context handed to each block's `compile()` function.
 *
 * The real {@link CompileContext} arrives in Sprint 9 — for now it
 * carries enough state for the canvas-mode renderers to short-circuit
 * the email-safe compile path when not actually exporting.
 */
export interface CompileContext {
  variables: Record<string, string>;
  warnings: string[];
}

/**
 * Block definition contract (CLAUDE.md §10.1).
 */
export interface BlockDefinition<T extends BlockBase = BlockBase> {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: BlockCategory;

  /** Creates a fresh block with sensible defaults. */
  create: () => T;

  /** Canvas renderer — must produce email-safe markup (tables + inline). */
  Renderer: FC<{ block: T; isPreview?: boolean }>;

  /** Sidebar property panel renderer. */
  PropertiesPanel: FC<{ block: T; onChange: (updates: Partial<T>) => void }>;

  /** Pure JSON → email-safe HTML compile function. */
  compile: (block: T, ctx: CompileContext) => string;

  /** Optional sanity checks; returns a list of warning strings. */
  validate?: (block: T) => string[];

  /** Whether this block can host other blocks (containers). */
  acceptsChildren?: boolean;
}

const registry = new Map<string, BlockDefinition>();

export function registerBlock<T extends BlockBase>(definition: BlockDefinition<T>): void {
  // The registry stores type-erased definitions. We cast through
  // `unknown` because BlockDefinition<T> is invariant in T (the
  // Renderer accepts T, not BlockBase) — the registry consumer
  // narrows back via the discriminated union when looking up.
  registry.set(definition.type, definition as unknown as BlockDefinition);
}

export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return registry.get(type);
}

export function getRegisteredBlocks(): BlockDefinition[] {
  return Array.from(registry.values());
}

export function getBlocksByCategory(category: BlockCategory): BlockDefinition[] {
  return getRegisteredBlocks().filter((d) => d.category === category);
}

/**
 * Type-erasing helper used by the canvas renderer where the union
 * shape can't easily flow through generics.
 */
export function rendererForBlock(block: Block): BlockDefinition | undefined {
  return registry.get(block.type);
}
