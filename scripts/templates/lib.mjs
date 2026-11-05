/**
 * Small, dependency-free helpers that build schema-1.1 signature JSON
 * for the shipped templates (`scripts/templates/build-templates.mjs`).
 *
 * Every helper returns plain JSON in the editor's schema
 * (`assets/editor/src/core/schema/blocks.ts`). Ids are unique within a
 * template: call {@link resetIds} before building each one.
 */

let counter = 0;

/** Restarts the id sequence (one sequence per template). */
export function resetIds() {
  counter = 0;
}

function id(prefix) {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** `[t, r, b, l]`, `[v, h]`, a number, or undefined → Padding. */
export function pad(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return { top: value, right: value, bottom: value, left: value };
  if (value.length === 2) return { top: value[0], right: value[1], bottom: value[0], left: value[1] };
  const [top, right, bottom, left] = value;
  return { top, right, bottom, left };
}

/** `[width, color, style?]` → BorderSide. */
export function side(value) {
  if (!value) return undefined;
  const [width, color, style = 'solid'] = value;
  return { width, style, color };
}

/**
 * Box shorthand: `{ bg, radius, pad, border, top, right, bottom, left, align, width }`.
 * Borders are `[width, color, style?]`.
 */
export function box(o = {}) {
  const out = {};
  if (o.bg) out.background_color = o.bg;
  if (o.border) out.border = side(o.border);
  if (o.top) out.border_top = side(o.top);
  if (o.right) out.border_right = side(o.right);
  if (o.bottom) out.border_bottom = side(o.bottom);
  if (o.left) out.border_left = side(o.left);
  if (o.radius) out.border_radius = o.radius;
  if (o.pad !== undefined) out.padding = pad(o.pad);
  if (o.align) out.align = o.align;
  if (o.width) out.width = o.width;
  return out;
}

function withCommon(block, o) {
  if (o.pad !== undefined) block.padding = pad(o.pad);
  if (o.box) block.box = box(o.box);
  return block;
}

/** TextStyle from shorthand: `{ font, size, weight, color, lh, align, ls, tt, italic }`. */
function textStyle(o, defaults = {}) {
  const s = { ...defaults };
  if (o.font) s.font_family = o.font;
  if (o.size) s.font_size = o.size;
  if (o.weight) s.font_weight = o.weight;
  if (o.color) s.color = o.color;
  if (o.lh) s.line_height = o.lh;
  if (o.align) s.text_align = o.align;
  if (o.ls !== undefined) s.letter_spacing = o.ls;
  if (o.tt) s.text_transform = o.tt;
  if (o.italic) s.font_style = 'italic';
  return s;
}

/** Plain text of a small HTML snippet (for the heading's `content`). */
function plain(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Heading block — `html` is inline rich text (one paragraph). */
export function heading(html, o = {}) {
  return withCommon(
    {
      id: id('h'),
      type: 'heading',
      content: plain(html),
      content_html: `<p>${html}</p>`,
      style: textStyle(o, { font_weight: 700, line_height: 1.2, text_align: 'left' }),
    },
    { pad: [0, 0, 2, 0], ...o },
  );
}

/** The employee's name, from their WordPress profile. */
export function nameHeading(o = {}) {
  return heading('{{wp_display_name}}', o);
}

/** Rich text block (`<strong>`, `<em>`, `<a>`, `<span style>`, `<br>`). */
export function text(html, o = {}) {
  return withCommon(
    {
      id: id('t'),
      type: 'text',
      content: html,
      style: textStyle(o, { line_height: 1.4, text_align: 'left' }),
    },
    { pad: [0, 0, 2, 0], ...o },
  );
}

/** Small print. */
export function disclaimer(html, o = {}) {
  return withCommon(
    {
      id: id('d'),
      type: 'disclaimer',
      content: plain(html),
      content_html: `<p>${html}</p>`,
      style: textStyle(o, { font_size: 10, color: '#6b7280', line_height: 1.5 }),
    },
    { pad: [10, 0, 0, 0], ...o },
  );
}

/**
 * Contact row. `items` are `[type, value, label?]` tuples
 * (type: email | phone | mobile | website | address | whatsapp | calendar | custom).
 */
export function contact(items, o = {}) {
  const block = {
    id: id('c'),
    type: 'contact_row',
    items: items.map(([type, value, label]) => {
      const item = { id: id('ci'), type, value };
      if (label) item.label = label;
      return item;
    }),
    layout: o.layout ?? 'stacked',
    separator: o.sep ?? '  |  ',
    show_icons: o.icons !== false,
    icon_shape: o.shape ?? 'plain',
    icon_tone: o.tone ?? 'gray',
    icon_size: o.iconSize ?? 14,
    label_mode: o.labels ?? 'none',
    row_gap: o.gap ?? 4,
    style: {
      font_size: o.size ?? 13,
      font_weight: o.weight ?? 400,
      color: o.color ?? '#374151',
      text_align: o.align ?? 'left',
      line_height: o.lh ?? 1.4,
    },
  };
  if (o.font) block.style.font_family = o.font;
  if (o.link) block.link_color = o.link;
  return withCommon(block, { pad: [0, 0, 0, 0], ...o });
}

/** Social icons. `items` are `[network, url]` tuples. */
export function social(items, o = {}) {
  return withCommon(
    {
      id: id('s'),
      type: 'social_icons',
      items: items.map(([network, url]) => ({ id: id('sn'), network, url })),
      shape: o.shape ?? 'circle',
      tone: o.tone ?? 'brand',
      size: o.size ?? 22,
      spacing: o.spacing ?? 6,
      align: o.align ?? 'left',
    },
    { pad: [0, 0, 0, 0], ...o },
  );
}

/** Horizontal rule. `o.px` sets a fixed length, otherwise `o.pct` (default 100). */
export function divider(o = {}) {
  const block = {
    id: id('dv'),
    type: 'divider',
    border: { width: o.width ?? 1, style: o.style ?? 'solid', color: o.color ?? '#e5e7eb' },
    width_percent: o.pct ?? 100,
    width_unit: o.px ? 'px' : 'percent',
    align: o.align ?? 'left',
  };
  if (o.px) block.width_px = o.px;
  return withCommon(block, { pad: [8, 0, 8, 0], ...o });
}

export function spacer(height) {
  return { id: id('sp'), type: 'spacer', height };
}

/** Button. Presets: solid | outline | pill | text. */
export function button(label, href, o = {}) {
  const block = {
    id: id('b'),
    type: 'button_cta',
    label,
    href,
    background_color: o.bg ?? '#1d4ed8',
    text_color: o.color ?? '#ffffff',
    border_radius: o.radius ?? 6,
    preset: o.preset ?? 'solid',
    padding_x: o.px ?? 18,
    padding_y: o.py ?? 9,
    align: o.align ?? 'left',
    style: textStyle(o, { font_size: 13, font_weight: 600 }),
  };
  if (o.bw !== undefined) block.border_width = o.bw;
  if (o.bc) block.border_color = o.bc;
  if (o.full) block.full_width = true;
  delete block.style.color;
  delete block.style.text_align;
  return withCommon(block, { pad: [8, 0, 0, 0], ...o });
}

/**
 * Profile photo. Templates point `src` at `{{photo_url}}`, whose
 * default is a pre-rendered placeholder PNG (shape baked in), so
 * nothing needs processing; the CSS shape still rounds a photo the
 * employee pastes later in modern clients.
 */
export function avatar(o = {}) {
  return withCommon(
    {
      id: id('a'),
      type: 'avatar',
      src: o.src ?? '{{photo_url}}',
      alt: o.alt ?? '{{wp_display_name}}',
      size: o.size ?? 80,
      shape: o.shape ?? 'circle',
      align: o.align ?? 'left',
    },
    { pad: [0, 0, 0, 0], ...o },
  );
}

/** Image block. */
export function image(src, o = {}) {
  const block = {
    id: id('i'),
    type: 'image',
    src,
    alt: o.alt ?? '',
    width: o.width ?? 120,
    align: o.align ?? 'left',
  };
  if (o.height) {
    block.height = o.height;
    block.lock_aspect = false;
  }
  if (o.link) block.link = o.link;
  if (o.radius) block.border_radius = o.radius;
  return withCommon(block, { pad: [0, 0, 0, 0], ...o });
}

/** The company logo from the brand kit, linked to the company website. */
export function logo(o = {}) {
  return image('{{company_logo}}', {
    alt: '{{company_name}}',
    link: '{{company_website}}',
    width: 120,
    ...o,
  });
}

/** Promotional banner (2× placeholder art in `assets/templates/`). */
export function banner(file, o = {}) {
  const block = {
    id: id('bn'),
    type: 'banner',
    src: `{{imgsig_assets_url}}/templates/${file}`,
    alt: o.alt ?? '',
    link: o.link ?? '{{website_url}}',
    width: o.width ?? 600,
    full_width: o.full ?? true,
    align: o.align ?? 'left',
    natural_width: 1200,
    natural_height: 300,
  };
  if (o.radius) block.border_radius = o.radius;
  return withCommon(block, { pad: [12, 0, 0, 0], ...o });
}

/** QR code; the editor renders and uploads the PNG once the template is applied. */
export function qr(data, o = {}) {
  const block = {
    id: id('q'),
    type: 'qr_code',
    data,
    size: o.size ?? 88,
    color: o.color ?? '#111827',
    background_color: o.bg ?? '#ffffff',
    align: o.align ?? 'left',
  };
  if (o.caption) block.caption = o.caption;
  return withCommon(block, { pad: [0, 0, 0, 0], ...o });
}

/** "Save my contact" vCard link; the editor uploads the .vcf once applied. */
export function vcard(o = {}) {
  return withCommon(
    {
      id: id('v'),
      type: 'vcard',
      label: o.label ?? 'Guardar contacto',
      full_name: '{{wp_display_name}}',
      organization: '{{company_name}}',
      title: '{{job_title}}',
      email: '{{wp_email}}',
      phone: o.phone ?? '{{mobile}}',
      website: '{{company_website}}',
      background_color: o.bg ?? '#111827',
      text_color: o.color ?? '#ffffff',
      border_radius: o.radius ?? 4,
      link_style: o.style ?? 'button',
      align: o.align ?? 'left',
    },
    { pad: [8, 0, 0, 0], ...o },
  );
}

/** Container column: `{ width, valign, box }`. */
export function col(children, o = {}) {
  const column = { id: id('col'), width: o.width ?? 50, children };
  if (o.valign) column.valign = o.valign;
  if (o.box) column.box = box(o.box);
  return column;
}

/**
 * Multi-column container. `o.pad` is spacing AROUND the row: containers
 * have no block padding of their own, so it becomes the padding of the
 * container's (otherwise transparent) box.
 */
export function row(columns, o = {}) {
  const block = {
    id: id('row'),
    type: 'container',
    columns,
    gap: o.gap ?? 16,
  };
  if (o.divider) block.divider = side(o.divider);
  if (o.stack) block.stack_on_mobile = true;
  const boxOpts = { ...(o.box ?? {}) };
  if (o.pad !== undefined) boxOpts.pad = o.pad;
  if (Object.keys(boxOpts).length > 0) block.box = box(boxOpts);
  return block;
}

/** Single-column container — a styled box (card / band) around blocks. */
export function card(children, boxOpts, o = {}) {
  return row([col(children, { width: 100, box: boxOpts })], { gap: 0, ...o });
}

/** A whole template. */
export function signature({
  width = 560,
  font = 'Arial, sans-serif',
  size = 14,
  textColor = '#1f2937',
  link = '#1d4ed8',
  background = '#ffffff',
  variables = {},
  blocks,
}) {
  return {
    schema_version: '1.1',
    meta: {
      created_at: '2026-11-05T00:00:00Z',
      updated_at: '2026-11-05T00:00:00Z',
      editor_version: '1.2.0',
    },
    canvas: {
      width,
      background_color: background,
      font_family: font,
      font_size: size,
      text_color: textColor,
      link_color: link,
    },
    variables,
    blocks,
  };
}
