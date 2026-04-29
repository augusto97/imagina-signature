// Types shared between the editor and the admin bundle.

export type SchemaVersion = '1.0';

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CanvasConfig {
  width: number;
  background_color: string;
  font_family: string;
  font_size: number;
  text_color: string;
  link_color: string;
}

export interface LayoutConfig {
  type: 'table';
  columns: 1 | 2 | 3;
  gap: number;
  padding: Padding;
}

export interface SignatureMeta {
  created_at: string;
  updated_at: string;
  editor_version: string;
}

export interface GridPosition {
  col: number;
  row: number;
  colspan?: number;
}

export interface TextStyle {
  font_family?: string;
  font_size?: number;
  font_weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  font_style?: 'normal' | 'italic';
  color?: string;
  text_align?: 'left' | 'center' | 'right';
  text_decoration?: 'none' | 'underline';
  line_height?: number;
  letter_spacing?: number;
}

export interface BlockBase {
  id: string;
  type: string;
  grid: GridPosition;
  padding?: Padding;
  visible?: boolean;
}

export interface TextBlock extends BlockBase {
  type: 'text';
  content: string;
  style: TextStyle;
}

export interface TextStackBlock extends BlockBase {
  type: 'text_stack';
  spacing: number;
  children: TextBlock[];
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  asset_id?: number;
  src: string;
  alt: string;
  width: number;
  height?: number;
  border_radius?: string;
  border?: { width: number; color: string; style: 'solid' };
  link?: string;
}

export interface DividerBlock extends BlockBase {
  type: 'divider';
  color: string;
  thickness: number;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface SpacerBlock extends BlockBase {
  type: 'spacer';
  height: number;
}

export interface SocialNetwork {
  name: string;
  url: string;
}

export interface SocialIconsBlock extends BlockBase {
  type: 'social_icons';
  networks: SocialNetwork[];
  size: number;
  gap: number;
  color: string;
  background_color?: string;
  style: 'flat' | 'rounded' | 'rounded_filled' | 'circle' | 'circle_filled';
}

export interface ContactItem {
  type: 'email' | 'phone' | 'website' | 'address' | 'custom';
  value: string;
  label?: string;
  icon?: string;
}

export interface ContactRowBlock extends BlockBase {
  type: 'contact_row';
  items: ContactItem[];
  layout: 'inline' | 'stacked';
  icon: boolean;
  icon_color: string;
  text_style: TextStyle;
}

export interface ButtonCtaBlock extends BlockBase {
  type: 'button_cta';
  text: string;
  url: string;
  background_color: string;
  text_color: string;
  border_radius: string;
  padding: Padding;
  font_size: number;
  font_weight: number;
}

export interface DisclaimerBlock extends BlockBase {
  type: 'disclaimer';
  content: string;
  style: TextStyle;
}

export interface ContainerBlock extends BlockBase {
  type: 'container';
  children: Block[];
  background_color?: string;
  border?: { width: number; color: string; style: 'solid'; radius?: string };
}

export type Block =
  | TextBlock
  | TextStackBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | SocialIconsBlock
  | ContactRowBlock
  | ButtonCtaBlock
  | DisclaimerBlock
  | ContainerBlock;

export interface SignatureSchema {
  schema_version: SchemaVersion;
  meta: SignatureMeta;
  canvas: CanvasConfig;
  layout: LayoutConfig;
  blocks: Block[];
  variables: Record<string, string>;
}

export interface SignatureRecord {
  id: number;
  user_id: number;
  name: string;
  json_content: SignatureSchema;
  html_cache: string | null;
  preview_url: string | null;
  template_id: number | null;
  status: 'draft' | 'ready' | 'archived';
  schema_version: SchemaVersion;
  created_at: string;
  updated_at: string;
}

export interface TemplateRecord {
  id: number;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  preview_url: string | null;
  json_content: SignatureSchema;
  is_premium: boolean;
  is_system: boolean;
  sort_order: number;
  schema_version: SchemaVersion;
  created_at: string;
}

export interface AssetRecord {
  id: number;
  user_id: number;
  storage_driver: string;
  storage_key: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  hash_sha256: string;
  created_at: string;
}

export interface PlanRecord {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  limits: {
    max_signatures: number;
    max_storage_bytes: number;
    max_image_size_bytes: number;
    allow_premium_templates: boolean;
    allow_animations: boolean;
    allow_html_export: boolean;
    allow_custom_branding: boolean;
    allow_oauth_install: boolean;
    custom_limits: Record<string, unknown>;
  };
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface MeResponse {
  user: { id: number; display_name: string; email: string };
  plan: PlanRecord;
  usage: {
    user_id: number;
    signatures_count: number;
    storage_bytes: number;
    last_activity_at: string | null;
    updated_at: string;
  };
  capabilities: string[];
  mode: 'single' | 'multi';
}

export interface ImaginaSignaturesBootstrap {
  apiUrl: string;
  nonce: string;
  pluginUrl: string;
  currentUser: { id: number; capabilities: string[] };
  mode: 'single' | 'multi';
  storage: { driver: string; configured: boolean };
  setup: { completed: boolean };
}

declare global {
  interface Window {
    ImaginaSignaturesData: ImaginaSignaturesBootstrap;
  }
}
