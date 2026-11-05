import type { BorderStyle, Padding, TextAlign, TextStyle, TypographyStyle } from './styles';

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
  height?: number;
  link?: string;
  border_radius?: number;
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
  src: string;
  alt: string;
  size: number;
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

export interface SocialNetwork {
  platform: string;
  url: string;
}

export interface SocialIconsBlock extends BlockBase {
  type: 'social_icons';
  networks: SocialNetwork[];
  icon_size: number;
  gap: number;
  color: string;
}

export interface ContactRowBlock extends BlockBase {
  type: 'contact_row';
  rows: Array<{ icon: 'email' | 'phone' | 'web'; label: string; href: string }>;
  style: TypographyStyle;
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

export interface ContainerBlock extends BlockBase {
  type: 'container';
  columns: 1 | 2;
  gap: number;
  /**
   * Percentage width of the LEFT column when `columns === 2`. The
   * right column gets `100 - left_width`. Optional for back-compat
   * with rows saved before this field existed — falls back to 50
   * (even split) at render / compile time.
   */
  left_width?: number;
  /**
   * Children of the LEFT cell when `columns === 2`. Also the only
   * cell when `columns === 1`. Always present. Reorderable
   * independently from `right_children`.
   */
  children: Block[];
  /**
   * Children of the RIGHT cell when `columns === 2`. Empty / absent
   * when `columns === 1`. Optional for back-compat with rows saved
   * before 1.0.31 — older 2-col rows used a single `children` array
   * the compiler split in half. `migrateContainersInPlace` rewrites
   * those into explicit left / right arrays on load.
   */
  right_children?: Block[];
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
