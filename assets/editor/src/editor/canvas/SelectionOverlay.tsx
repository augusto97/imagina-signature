import type { FC, ReactNode } from 'react';

interface Props {
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  children: ReactNode;
}

/**
 * Wraps a block with the selection / hover outline.
 *
 * The outline is drawn as a positioned absolutely-placed div instead
 * of a border on the wrapper itself so it doesn't mess with the
 * table-based block layout. Selected uses a 1px solid ring with an
 * outer offset glow so the boundary reads cleanly without feeling
 * heavy; hover is a 1px neutral ring.
 *
 * Nesting: blocks inside a container render their own overlay inside
 * the container's. Hover uses `mouseover` + `stopPropagation` so the
 * innermost block under the pointer is the hovered one (moving from a
 * child back onto the container's own area re-hovers the container),
 * and click selection stops propagation the same way.
 */
export const SelectionOverlay: FC<Props> = ({
  selected,
  hovered,
  onSelect,
  onHoverEnter,
  onHoverLeave,
  children,
}) => {
  let overlayStyle: React.CSSProperties = { transition: 'box-shadow 120ms ease' };
  if (selected) {
    overlayStyle = {
      ...overlayStyle,
      boxShadow: '0 0 0 1px var(--accent), 0 0 0 4px rgba(37, 99, 235, 0.12)',
      borderRadius: 4,
    };
  } else if (hovered) {
    overlayStyle = {
      ...overlayStyle,
      boxShadow: '0 0 0 1px var(--border-strong)',
      borderRadius: 4,
    };
  }

  return (
    <div
      className="relative"
      onMouseOver={(e) => {
        e.stopPropagation();
        onHoverEnter();
      }}
      onMouseLeave={onHoverLeave}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {children}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={overlayStyle} />
    </div>
  );
};
