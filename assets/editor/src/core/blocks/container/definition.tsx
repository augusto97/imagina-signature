import { Columns3 } from 'lucide-react';
import type { ContainerBlock } from '@/core/schema/blocks';
import { createColumns } from '@/core/schema/columns';
import { generateId } from '@/utils/idGenerator';
import { registerBlock, type BlockDefinition } from '../registry';
import { ContainerRenderer } from './ContainerBlock';
import { ContainerProperties } from './ContainerProperties';
import { compileContainer } from './compileContainer';

/**
 * Multi-column container (schema 1.1, "container v2").
 *
 *  - 1..4 columns, each `{ id, width %, valign?, box?, children }`.
 *  - Gap, optional vertical divider between columns, optional
 *    stacking on narrow screens (hybrid email technique).
 *  - One level of nesting: a container may sit in a column of a
 *    top-level container.
 *
 * Module layout (CLAUDE.md §10.3):
 *  - `geometry.ts`           pixel widths + cell declarations (shared)
 *  - `compileContainer.ts`   JSON → email HTML
 *  - `ContainerBlock.tsx`    canvas renderer with per-column drop zones
 *  - `ContainerProperties.tsx` sidebar panel
 */
const definition: BlockDefinition<ContainerBlock> = {
  type: 'container',
  label: 'Container',
  description: 'Up to 4 columns with their own blocks, widths and styling.',
  icon: Columns3,
  category: 'layout',
  create: (): ContainerBlock => ({
    id: generateId('cnt'),
    type: 'container',
    columns: createColumns([50, 50]),
    gap: 16,
  }),
  Renderer: ContainerRenderer,
  PropertiesPanel: ContainerProperties,
  compile: compileContainer,
  acceptsChildren: true,
};

registerBlock(definition);
export { definition as containerDefinition };
export { containerGeometry, type ColumnGeometry } from './geometry';
export { cellDropId } from '@/editor/canvas/dnd';
