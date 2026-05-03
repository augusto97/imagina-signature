import type { Block, ContainerBlock } from './blocks';
import type { SignatureSchema } from './signature';

/**
 * In-place migration of older container rows.
 *
 * Pre-1.0.31 containers carried a single `children: Block[]` array
 * that the compile pipeline split via `Math.ceil(length / 2)` to
 * derive left vs right cells. That gave the user no control over
 * which children went where — every odd-position child landed in
 * the left cell, every even-position one in the right.
 *
 * 1.0.31+ stores left / right cells as explicit arrays
 * (`children` for the LEFT or only cell, `right_children` for the
 * right cell when `columns === 2`). This walker visits every
 * container in a freshly-loaded schema and, when it finds a 2-col
 * container with no `right_children` field yet, splits the existing
 * `children` array using the legacy half-by-half rule so the user
 * sees the same layout they had before, and from there can drag /
 * drop / add into either cell independently.
 *
 * Idempotent: if `right_children` is already an array, the function
 * leaves the container alone.
 */
export function migrateContainersInPlace(schema: SignatureSchema): void {
  walk(schema.blocks);
}

function walk(blocks: Block[]): void {
  for (const block of blocks) {
    if (block.type !== 'container') continue;

    const c = block as ContainerBlock;

    if (c.columns === 2 && !Array.isArray(c.right_children)) {
      const half = Math.ceil((c.children?.length ?? 0) / 2);
      const left = c.children?.slice(0, half) ?? [];
      const right = c.children?.slice(half) ?? [];
      c.children = left;
      c.right_children = right;
    } else if (c.columns === 1 && Array.isArray(c.right_children) && c.right_children.length > 0) {
      // Defensive: a 1-col container should never carry right_children
      // (toggling 2→1 merges them back into `children`). If somehow a
      // legacy or hand-edited row has both, fold right back in so no
      // child is lost.
      c.children = [...(c.children ?? []), ...c.right_children];
      c.right_children = [];
    }

    if (!Array.isArray(c.right_children)) {
      c.right_children = [];
    }

    // Recurse — though we don't allow nested containers in the UI,
    // a hand-edited JSON or a future feature could put one inside
    // another, and we still want their cells migrated.
    walk(c.children);
    walk(c.right_children);
  }
}
