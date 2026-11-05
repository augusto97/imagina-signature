import type { BorderStyle, Padding, TypographyStyle } from './styles';

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
