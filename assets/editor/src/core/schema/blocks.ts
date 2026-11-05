import type {
  BorderSide,
  BorderStyle,
  BoxStyle,
  Padding,
  TextAlign,
  TextStyle,
  TypographyStyle,
  VerticalAlign,
} from './styles';

/**
 * Block type definitions mirroring CLAUDE.md §8.1 / §10.2.
 *
 * Each concrete block extends `BlockBase` and declares its own
 * payload shape. The `Block` discriminated union is what the
 * schema's `blocks: Block[]` array holds.
 */

export interface BlockBase {
  /** Stable unique id within a single signature. Generated client-side. */
  id: string;
  type: string;
  padding?: Padding;
  visible?: boolean;
  /**
   * Optional generic box styling (schema 1.1): background, borders,
   * radius, inner padding, alignment, fixed width. Applied around the
   * block's own markup by the canvas (`BoxFrame`) and the compiler
   * (`compileBlock` → `wrapInBox`), so block definitions never need to
   * know about it.
   */
  box?: BoxStyle;
  /**
   * Locked by an administrator (1.3.0). On a signature that follows a
   * company template, employees can't edit, move, duplicate or delete
   * it; a locked container locks everything inside it. See
   * `core/schema/locks.ts`.
   */
  locked?: boolean;
}

// ---------------------------------------------------------------------------
// Concrete blocks (a representative subset is implemented in Sprints 5-8;
// the remaining ones are still typed here so downstream code can reference
// them without churn).
// ---------------------------------------------------------------------------

export interface TextBlock extends BlockBase {
  type: 'text';
  content: string; // HTML produced by Tiptap (email-safe whitelist)
  /** Unset family / size / colour inherit the canvas defaults. */
  style: TextStyle;
}

export interface HeadingBlock extends BlockBase {
  type: 'heading';
  /**
   * Plain-text version of the heading. Before 1.2 this was the only
   * field; it is still written (derived from `content_html`) so
   * plain-text export, the Layers panel and older readers keep working.
   */
  content: string;
  /**
   * Rich-text HTML (single paragraph, email-safe allowlist). Absent on
   * rows saved before 1.2 — and ignored when `content` was edited
   * without it — in which case `content` is escaped and used instead
   * (see `core/blocks/text/richText.ts`).
   */
  content_html?: string;
  style: TextStyle;
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  src: string;
  alt: string;
  width?: number;
  /**
   * Explicit height. Used when `lock_aspect` is off, or when it is on
   * but the intrinsic size of `src` is unknown (pasted URL, pre-1.2
   * rows). Scaled with the width when the image is clamped to the
   * available space.
   */
  height?: number;
  link?: string;
  border_radius?: number;
  /** Horizontal alignment in the available width. Absent = `left`. */
  align?: 'left' | 'center' | 'right';
  /**
   * Keep the height proportional to the width. Absent = `true`. With
   * `natural_*` known the compiled height is derived from the image's
   * own aspect ratio, otherwise from `width` / `height`.
   */
  lock_aspect?: boolean;
  /**
   * Intrinsic pixel size of `src`, recorded when the image comes from
   * an upload, the asset library or a crop. Absent for pasted URLs.
   */
  natural_width?: number;
  natural_height?: number;
  /** Optional border drawn around the image (absent / width 0 = none). */
  border?: BorderStyle;
  /**
   * Optional URL of a static image used as a graceful fallback for
   * Outlook 2007–2019 (which freezes animated GIFs on the first
   * frame, often a transparent placeholder). When set, the compile
   * pipeline emits an `<!--[if mso]>` block that swaps `src` for
   * this URL on those clients while modern clients keep the
   * animated original. Optional and only relevant when `src` is a
   * GIF.
   */
  static_fallback_url?: string;
}

export interface AvatarBlock extends BlockBase {
  type: 'avatar';
  /**
   * Image the email references. Once the editor has rendered the
   * avatar (see `processed`) this is a PNG with the shape mask and the
   * ring baked in; otherwise it is the user's image as-is.
   */
  src: string;
  alt: string;
  size: number;
  /** Absent = `circle` (the only shape before 1.2). */
  shape?: 'circle' | 'rounded' | 'square';
  /** Ring (outline) width in px around the photo. Absent / 0 = none. */
  ring_width?: number;
  ring_color?: string;
  /** Horizontal alignment in the available width. Absent = `left`. */
  align?: 'left' | 'center' | 'right';
  link?: string;
  /**
   * The user's (unmasked) photo the masked `src` is rendered from.
   * Set when the image was uploaded, picked from the library or
   * cropped; absent for pasted URLs and pre-1.2 rows (then `src` is
   * the source and the shape is drawn with CSS only).
   */
  source_url?: string;
  /** What `src` was rendered with — absent when `src` is not a rendered PNG. */
  processed?: {
    source_url: string;
    shape: 'circle' | 'rounded' | 'square';
    ring_width: number;
    ring_color: string;
    size: number;
  };
}

export interface DividerBlock extends BlockBase {
  type: 'divider';
  /** Line style, thickness (`width`) and colour. */
  border: BorderStyle;
  /** Line length as a percentage of the available width (`width_unit` 'percent'). */
  width_percent: number;
  /** How the line length is expressed. Absent = 'percent'. */
  width_unit?: 'percent' | 'px';
  /** Line length in px when `width_unit` is 'px' (clamped to the available width). */
  width_px?: number;
  /** Horizontal position of a line shorter than the available width. Absent = left. */
  align?: TextAlign;
}

export interface SpacerBlock extends BlockBase {
  type: 'spacer';
  height: number;
}

/** v1 social entry (letter circles). Read only to migrate old blocks. */
export interface SocialNetwork {
  platform: string;
  url: string;
}

/**
 * Row of hosted PNG social icons.
 *
 * v2 (1.2.0) fields are all optional so v1 rows keep loading; the
 * block's own normaliser (`core/blocks/social-icons/normalize.ts`)
 * turns a v1 row (`networks` / `icon_size` / `gap` / `color`) into the
 * v2 shape on render / compile, and the properties panel writes v2 on
 * the first edit (clearing the v1 keys).
 */
export interface SocialIconsBlock extends BlockBase {
  type: 'social_icons';
  /** One entry per icon, in display order. `network` is an icon name from `assets/icons/manifest.json`. */
  items?: Array<{ id: string; network: string; url: string }>;
  /** Icon background. Default `circle`. */
  shape?: 'circle' | 'rounded' | 'plain';
  /** Colour treatment. Default `brand`; `light` is for dark backgrounds. */
  tone?: 'brand' | 'dark' | 'gray' | 'light';
  /** Displayed icon edge in px (16–40). Default 24. */
  size?: number;
  /** Gap between icons in px (0–24). Default 8. */
  spacing?: number;
  /** Row alignment inside the block. Default `left`. */
  align?: 'left' | 'center' | 'right';
  /** @deprecated v1 — use `items`. */
  networks?: SocialNetwork[];
  /** @deprecated v1 — use `size`. */
  icon_size?: number;
  /** @deprecated v1 — use `spacing`. */
  gap?: number;
  /** @deprecated v1 — letter-circle colour; mapped to a `tone`. */
  color?: string;
}

/**
 * Contact details (email, phone, web, address…) with hosted PNG icons.
 *
 * v2 (1.2.0) fields are optional; v1 rows (`rows: [{ icon, label,
 * href }]`) are converted by `core/blocks/contact-row/normalize.ts` on
 * render / compile and rewritten as v2 on the first edit.
 */
export interface ContactRowBlock extends BlockBase {
  type: 'contact_row';
  /**
   * One entry per contact detail. `value` is the visible text; the link
   * is derived from it per `type` (mailto:, tel:, wa.me, https://, a
   * Maps search…) unless `href` overrides it. `label` is the per-item
   * prefix used when `label_mode` is `custom`.
   */
  items?: Array<{
    id: string;
    type: 'email' | 'phone' | 'mobile' | 'website' | 'address' | 'whatsapp' | 'calendar' | 'custom';
    value: string;
    label?: string;
    href?: string;
  }>;
  /** `stacked` = one row per item; `inline` = a single line. Default `stacked`. */
  layout?: 'stacked' | 'inline';
  /** Inline separator (e.g. ' | ', ' · ', ' / '). Default ' | '. */
  separator?: string;
  /** Show an icon before each item. Default true. */
  show_icons?: boolean;
  icon_shape?: 'circle' | 'rounded' | 'plain';
  icon_tone?: 'brand' | 'dark' | 'gray' | 'light';
  /** Displayed icon edge in px (12–32). Default 16. */
  icon_size?: number;
  /** Prefix before each value: none, short ("T:", "E:"…) or each item's `label`. Default none. */
  label_mode?: 'none' | 'short' | 'custom';
  /** Colour of linked values. Defaults to `style.color`. */
  link_color?: string;
  /** Vertical gap between stacked rows in px (0–24). Default 4. */
  row_gap?: number;
  /**
   * Typography. `font_family` may be omitted (v2) to inherit the
   * canvas font; `text_align` aligns the whole block.
   */
  style: Omit<TypographyStyle, 'font_family'> & { font_family?: string };
  /** @deprecated v1 — use `items`. */
  rows?: Array<{ icon: 'email' | 'phone' | 'web'; label: string; href: string }>;
}

/** Visual preset of a button. */
export type ButtonPreset = 'solid' | 'outline' | 'pill' | 'text';

export interface ButtonCtaBlock extends BlockBase {
  type: 'button_cta';
  label: string;
  href: string;
  /** Fill colour (`solid` / `pill`); the default border colour of `outline`. */
  background_color: string;
  text_color: string;
  border_radius: number;
  /*
   * Button v2 (1.2). Every field is optional: rows saved before keep
   * the v1 look (solid, 12px × 24px padding, 14px semibold label,
   * left-aligned, no border).
   */
  /** Absent = 'solid'. */
  preset?: ButtonPreset;
  /** Horizontal inner padding in px (default 24). */
  padding_x?: number;
  /** Vertical inner padding in px (default 12). */
  padding_y?: number;
  /** Label typography; `color` is unused (see `text_color`). Unset family / size inherit the canvas. */
  style?: TextStyle;
  /** Border thickness in px (default 0; `outline` uses at least 1). */
  border_width?: number;
  /** Border colour (default `background_color`). */
  border_color?: string;
  /** Stretch the button to the available width. */
  full_width?: boolean;
  /** Horizontal position. Absent = left. */
  align?: TextAlign;
}

export interface DisclaimerBlock extends BlockBase {
  type: 'disclaimer';
  /**
   * Plain-text version (newlines = line breaks). The only field before
   * 1.2; still written, derived from `content_html`.
   */
  content: string;
  /**
   * Rich-text HTML (bold / italic / links). Absent on older rows, in
   * which case `content` is escaped and its newlines become `<br>`.
   */
  content_html?: string;
  style: TextStyle;
}

/** Maximum number of columns a container can hold. */
export const MAX_CONTAINER_COLUMNS = 4;

/**
 * One column of a {@link ContainerBlock} (schema 1.1).
 */
export interface ContainerColumn {
  /** Stable id, unique within the signature (drop-zone ids use it). */
  id: string;
  /** Percentage of the row; the columns of a container sum to 100. */
  width: number;
  /** Vertical alignment of the column's content. Defaults to `top`. */
  valign?: VerticalAlign;
  /** Column-level box (background, border, radius, padding, alignment). */
  box?: BoxStyle;
  children: Block[];
}

/**
 * Multi-column layout row (schema 1.1, "container v2").
 *
 * Replaces the 1.0 shape (`columns: 1 | 2`, `children`,
 * `right_children`, `left_width`); `migrateSchemaInPlace()` rewrites
 * older rows on load. One level of nesting is allowed: a container may
 * sit in a column of a top-level container, but not deeper (see
 * `MAX_CONTAINER_NESTING` in `core/schema/tree.ts`).
 */
export interface ContainerBlock extends BlockBase {
  type: 'container';
  /** 1..{@link MAX_CONTAINER_COLUMNS} columns, left to right. */
  columns: ContainerColumn[];
  /** Horizontal space between columns, in px. */
  gap: number;
  /**
   * When true the export uses the hybrid ("spongy") technique so narrow
   * clients stack the columns; the mobile preview shows them stacked.
   */
  stack_on_mobile?: boolean;
  /** Optional vertical rule drawn between columns. */
  divider?: BorderSide;
}

export interface QrCodeBlock extends BlockBase {
  type: 'qr_code';
  /** What the QR encodes — typically a URL, but vCard / mailto / tel work too. */
  data: string;
  /** Edge length in px in the rendered email. */
  size: number;
  /** Foreground (modules) colour. */
  color: string;
  /** Background colour. */
  background_color: string;
  /** Optional caption rendered below the QR. */
  caption?: string;
  /**
   * Public URL of the uploaded QR PNG (rendered at 2x `size`). Set by
   * the editor after it uploads the image; email clients don't show
   * data: images, so the compiler only ever references this URL.
   * Optional so older signatures (no hosted asset yet) still load.
   */
  image_url?: string;
  /** `qrContentHash()` of the inputs `image_url` was rendered from. */
  image_hash?: string;
  /** Horizontal position of the QR (+ caption). Absent = left. */
  align?: TextAlign;
}

export interface BannerBlock extends BlockBase {
  type: 'banner';
  src: string;
  alt: string;
  link: string;
  /** Width in px, capped to the canvas width at compile time. */
  width: number;
  border_radius?: number;
  /**
   * Fill the whole width available where the banner sits (ignores
   * `width`). Absent = `false`, so pre-1.2 rows keep their fixed width.
   */
  full_width?: boolean;
  /** Horizontal alignment when narrower than the space. Absent = `center`. */
  align?: 'left' | 'center' | 'right';
  /** Intrinsic pixel size of `src` (upload / library); absent for pasted URLs. */
  natural_width?: number;
  natural_height?: number;
  /**
   * Optional static image URL used as a graceful Outlook 2007–2019
   * fallback when `src` is an animated GIF. See `ImageBlock` for the
   * mechanism (`<!--[if mso]>` swaps the `src` for this on those
   * clients only).
   */
  static_fallback_url?: string;
}

export interface VCardBlock extends BlockBase {
  type: 'vcard';
  /** The link label rendered in the email (e.g. "Save my contact"). */
  label: string;
  /** vCard fields — empty strings just get omitted from the output. */
  full_name: string;
  organization: string;
  title: string;
  email: string;
  phone: string;
  website: string;
  /** Visual style for the link / button. */
  background_color: string;
  text_color: string;
  border_radius: number;
  /**
   * Public URL of the uploaded `.vcf` file the link points to. Set by
   * the editor after upload (replaces the old data:text/vcard href).
   * Optional so older signatures (no hosted asset yet) still load.
   */
  vcf_url?: string;
  /** `vcardContentHash()` of the vCard text `vcf_url` was generated from. */
  vcf_hash?: string;
  /** Render the link as a button (default) or as a plain text link. */
  link_style?: 'button' | 'text';
  /** Horizontal position. Absent = left. */
  align?: TextAlign;
}

export type Block =
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | AvatarBlock
  | DividerBlock
  | SpacerBlock
  | SocialIconsBlock
  | ContactRowBlock
  | ButtonCtaBlock
  | DisclaimerBlock
  | ContainerBlock
  | QrCodeBlock
  | BannerBlock
  | VCardBlock;
