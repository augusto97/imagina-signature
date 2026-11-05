import type { FC, ReactNode } from 'react';
import type { BoxStyle } from '@/core/schema/styles';
import { isBoxEmpty } from '@/core/schema/box';
import { boxAlign, boxCellDeclarations } from '@/core/compiler/box';
import { intPx } from '@/core/compiler/css';
import { toReactStyle } from '@/utils/reactStyle';

interface Props {
  box?: BoxStyle;
  children: ReactNode;
}

/**
 * Canvas counterpart of the compiler's `wrapInBox()`: renders the same
 * presentation table + styled cell around a block (or anything else),
 * using the very same declarations ({@link boxCellDeclarations}), so
 * what the user sees on the canvas is what recipients get.
 *
 * Renders `children` untouched when the box is empty. A fixed width
 * larger than the space on the canvas is capped with `max-width:100%`
 * (the compiler clamps it to the available pixels instead).
 */
export const BoxFrame: FC<Props> = ({ box, children }) => {
  if (!box || isBoxEmpty(box)) return <>{children}</>;

  const align = boxAlign(box);
  const width = Number(box.width) > 0 ? intPx(box.width, 1, 4000, 1) : null;
  const cellAlign = align !== 'left' ? align : undefined;

  const table = (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      width={width ?? '100%'}
      align={width && align === 'center' ? 'center' : undefined}
      data-imgsig-box=""
      style={{
        borderCollapse: 'separate',
        borderSpacing: 0,
        width: width ?? '100%',
        maxWidth: '100%',
        margin: width && align === 'center' ? '0 auto' : undefined,
      }}
    >
      <tbody>
        <tr>
          <td align={cellAlign} style={toReactStyle(boxCellDeclarations(box))}>
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  );

  if (width && align === 'right') {
    return (
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        width="100%"
        style={{ borderCollapse: 'collapse', width: '100%' }}
      >
        <tbody>
          <tr>
            <td align="right" style={{ textAlign: 'right' }}>
              {table}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }
  return table;
};
