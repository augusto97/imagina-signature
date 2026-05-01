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
  children: Block[];
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
}

export interface BannerBlock extends BlockBase {
  type: 'banner';
  src: string;
  alt: string;
  link: string;
  /** Width in px, capped to the canvas width at compile time. */
  width: number;
  border_radius?: number;
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
