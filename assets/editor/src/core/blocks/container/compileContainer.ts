import type { ContainerBlock } from '@/core/schema/blocks';
import type { CompileContext } from '@/core/blocks/registry';
import { compileBlocks } from '@/core/compiler/compile-block';
import { bgcolorAttr, inlineStyle } from '@/core/compiler/css';
import { boxAlign } from '@/core/compiler/box';
import {
  columnCellDeclarations,
  containerGeometry,
  hasRoundedColumns,
  type ColumnGeometry,
} from './geometry';

const TABLE_ATTRS = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

/**
 * Container v2 → email HTML.
 *
 * Every child goes through `compileBlocks()` (hidden / unknown skipped,
 * child boxes applied) with its column's INNER pixel width as
 * `availableWidth`, so images clamp to the space they really get.
 *
 * Default layout — one row, N cells:
 *
 *   <table … width="100%" style="…;table-layout:fixed;mso-table-lspace:0pt;mso-table-rspace:0pt">
 *     <tr><td width="<px>" valign="top" [bgcolor] style="vertical-align:top;width:<%>;padding-right:<gap/2>px…">…</td>…</tr>
 *   </table>
 *
 * `table-layout:fixed` makes clients honour the widths instead of
 * sizing cells by content (a QR code would otherwise squeeze the text
 * column); the pixel `width` attribute is what Outlook on Windows
 * reads, the `%` style what everyone else does.
 *
 * `stack_on_mobile` — the hybrid / "spongy" technique, no media
 * queries: every column is an inline-block
 * `<div style="display:inline-block;vertical-align:top;width:100%;max-width:<px>px">`,
 * so the columns sit side by side while there is room and wrap below
 * each other on narrow screens. Outlook desktop (no inline-block, no
 * max-width) gets ghost table cells inside `<!--[if mso]>` comments.
 */
export function compileContainer(block: ContainerBlock, ctx: CompileContext): string {
  const geometry = containerGeometry(block, ctx.availableWidth);
  if (geometry.length === 0) return '';

  const cells = geometry.map((geo) => ({
    geo,
    html: compileBlocks(geo.column.children, { ...ctx, availableWidth: geo.inner }) || '&nbsp;',
  }));

  return block.stack_on_mobile === true ? compileStacked(block, cells) : compileFixed(block, cells);
}

interface CompiledCell {
  geo: ColumnGeometry;
  html: string;
}

function cellAttrs(geo: ColumnGeometry): string {
  const valign = geo.column.valign ?? 'top';
  const align = boxAlign(geo.column.box);
  return (
    ` valign="${valign}"` +
    bgcolorAttr(geo.column.box?.background_color) +
    (align !== 'left' ? ` align="${align}"` : '')
  );
}

function compileFixed(block: ContainerBlock, cells: CompiledCell[]): string {
  const tableStyle = inlineStyle({
    'border-collapse': hasRoundedColumns(block) ? 'separate' : 'collapse',
    'border-spacing': hasRoundedColumns(block) ? 0 : undefined,
    width: '100%',
    'table-layout': 'fixed',
    'mso-table-lspace': '0pt',
    'mso-table-rspace': '0pt',
  });
  const tds = cells
    .map(
      ({ geo, html }) =>
        `<td width="${geo.outer}"${cellAttrs(geo)} style="${inlineStyle(columnCellDeclarations(geo))}">${html}</td>`,
    )
    .join('');
  return `<table ${TABLE_ATTRS} width="100%" style="${tableStyle}"><tr>${tds}</tr></table>`;
}

function compileStacked(block: ContainerBlock, cells: CompiledCell[]): string {
  const innerTableStyle = inlineStyle({
    'border-collapse': hasRoundedColumns(block) ? 'separate' : 'collapse',
    'border-spacing': hasRoundedColumns(block) ? 0 : undefined,
    width: '100%',
    'mso-table-lspace': '0pt',
    'mso-table-rspace': '0pt',
  });

  const parts: string[] = [];
  cells.forEach(({ geo, html }, i) => {
    const valign = geo.column.valign ?? 'top';
    parts.push(
      i === 0
        ? `<!--[if mso]><table ${TABLE_ATTRS} width="100%"><tr><td width="${geo.outer}" valign="${valign}"><![endif]-->`
        : `<!--[if mso]></td><td width="${geo.outer}" valign="${valign}"><![endif]-->`,
    );
    const divStyle = inlineStyle({
      display: 'inline-block',
      'vertical-align': valign,
      width: '100%',
      'max-width': `${geo.outer}px`,
    });
    const tdStyle = inlineStyle(columnCellDeclarations(geo, { includeWidth: false }));
    parts.push(
      `<div style="${divStyle}"><table ${TABLE_ATTRS} width="100%" style="${innerTableStyle}"><tr><td${cellAttrs(geo)} style="${tdStyle}">${html}</td></tr></table></div>`,
    );
  });
  parts.push('<!--[if mso]></td></tr></table><![endif]-->');

  const outerStyle = inlineStyle({
    'border-collapse': 'collapse',
    width: '100%',
    'mso-table-lspace': '0pt',
    'mso-table-rspace': '0pt',
  });
  return `<table ${TABLE_ATTRS} width="100%" style="${outerStyle}"><tr><td>${parts.join('')}</td></tr></table>`;
}
