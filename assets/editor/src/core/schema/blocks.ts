import type {
  BorderSide,
  BorderStyle,
  BoxStyle,
  Padding,
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
}

// ---------------------------------------------------------------------------
// Concrete blocks (a representative subset is implemented in Sprints 5-8;
// the remaining ones are still typed here so downstream code can reference
// them without churn).
// ---------------------------------------------------------------------------

export interface TextBlock extends BlockBase {
  type: 'text';
  content: string; // HTML produced by Tiptap (email-safe whitelist)
  style: TypographyStyle;
}

export interface HeadingBlock extends BlockBase {
  type: 'heading';
  content: string;
  style: TypographyStyle;
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
  border: BorderStyle;
  width_percent: number;
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

export interface ButtonCtaBlock extends BlockBase {
  type: 'button_cta';
  label: string;
  href: string;
  background_color: string;
  text_color: string;
  border_radius: number;
}

export interface DisclaimerBlock extends BlockBase {
  type: 'disclaimer';
  content: string;
  style: TypographyStyle;
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
