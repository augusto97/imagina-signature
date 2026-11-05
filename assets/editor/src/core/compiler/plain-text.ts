import type {
  Block,
  ButtonCtaBlock,
  ContactRowBlock,
  ContainerBlock,
  QrCodeBlock,
  SocialIconsBlock,
  VCardBlock,
} from '@/core/schema/blocks';
import type { SignatureSchema } from '@/core/schema/signature';
import { __ } from '@/i18n/helpers';
import {
  contactHref,
  normalizeContactRow,
  type ContactType,
} from '@/core/blocks/contact-row/normalize';
import { iconTitle } from '@/core/blocks/social-icons/iconSet';
import { normalizeSocialIcons, socialHref } from '@/core/blocks/social-icons/normalize';
import { sanitizeEmailHtml } from './sanitize';

/**
 * Plain-text rendition of a signature, generated from the SCHEMA (not
 * by stripping the compiled HTML, which used to produce "96Email
 * Signature…" from the <head> and spelled out the social icons' letter
 * glyphs).
 *
 * - Headings / text / disclaimers → their text, one block per line.
 * - Links → the visible label followed by the URL when they differ.
 * - Contact rows → "Email: jane@acme.com", "Web: https://acme.com".
 * - Social icons → "LinkedIn: https://…" per network.
 * - Buttons, linked images / banners, QR codes (URL payloads) and
 *   vCards → "label: URL".
 * - Variables are substituted with their raw (unescaped) values.
 */
export function schemaToPlainText(
  schema: SignatureSchema,
  variables: Record<string, string>,
  extraLines: string[] = [],
): string {
  const lines = [...blockLines(schema.blocks), ...extraLines];
  const text = lines
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return substitutePlain(text, variables);
}

function blockLines(blocks: Block[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.visible === false) continue;
    out.push(...linesFor(block));
  }
  return out;
}

function linesFor(block: Block): string[] {
  switch (block.type) {
    case 'heading':
    case 'disclaimer':
      return nonEmpty(String(block.content ?? '').split(/\r?\n/));
    case 'text':
      return nonEmpty(htmlToPlainText(block.content).split('\n'));
    case 'contact_row':
      return contactLines(block);
    case 'social_icons':
      return socialLines(block);
    case 'button_cta':
      return buttonLines(block);
    case 'image':
      return block.link ? [labelled(block.alt || __('Link'), block.link)] : [];
    case 'banner':
      return block.link ? [labelled(block.alt || __('Link'), block.link)] : [];
    case 'qr_code':
      return qrLines(block);
    case 'vcard':
      return vcardLines(block);
    case 'divider':
      return [''];
    case 'container':
      return containerLines(block);
    default:
      return [];
  }
}

function contactLines(block: ContactRowBlock): string[] {
  // v1 rows and v2 items alike — the block's normaliser converts v1.
  const kindLabel: Record<ContactType, string> = {
    email: __('Email'),
    phone: __('Phone'),
    mobile: __('Mobile'),
    website: __('Web'),
    address: __('Address'),
    whatsapp: 'WhatsApp', // i18n-ignore
    calendar: __('Booking link'),
    custom: '',
  };
  const contact = normalizeContactRow(block);
  return contact.items
    .map((item) => {
      // An address reads better without its Maps search URL.
      const href = item.type === 'address' ? '' : contactHref(item);
      const value = linkText(item.value, href);
      if (!value) return '';
      const custom = contact.label_mode === 'custom' ? (item.label ?? '').trim() : '';
      if (custom) return `${custom}: ${value}`;
      // Values like "Reception: +1 555…" already carry their own prefix.
      if (/:\s/.test(item.value)) return value;
      const prefix = kindLabel[item.type];
      return prefix ? `${prefix}: ${value}` : value;
    })
    .filter(Boolean);
}

function socialLines(block: SocialIconsBlock): string[] {
  return normalizeSocialIcons(block)
    .items.map((item) => ({ item, href: socialHref(item.network, item.url) }))
    .filter(({ href }) => href !== '')
    .map(({ item, href }) => `${iconTitle(item.network)}: ${href.replace(/^mailto:/i, '')}`);
}

function buttonLines(block: ButtonCtaBlock): string[] {
  if (!block.href || /^https?:\/\/?$/.test(block.href.trim())) return nonEmpty([block.label]);
  return [labelled(block.label || __('Link'), block.href)];
}

function qrLines(block: QrCodeBlock): string[] {
  const data = String(block.data ?? '').trim();
  if (!/^https?:\/\//i.test(data)) return [];
  return [labelled(block.caption || __('QR code'), data)];
}

function vcardLines(block: VCardBlock): string[] {
  if (!block.vcf_url) return [];
  return [labelled(block.label || __('Save my contact'), block.vcf_url)];
}

function containerLines(block: ContainerBlock): string[] {
  const right = Array.isArray(block.right_children) ? block.right_children : [];
  return [...blockLines(block.children ?? []), ...blockLines(right)];
}

/** "Label: url" — or just the URL when the label adds nothing. */
function labelled(label: string, url: string): string {
  const l = label.trim();
  const u = url.trim();
  if (!l || sameTarget(l, u)) return u;
  return `${l}: ${u}`;
}

/** Inline link rendition: the label, plus the URL when it differs. */
function linkText(label: string, href: string): string {
  const l = label.trim();
  const h = href.trim();
  if (!h || h === '#') return l;
  const address = h.replace(/^(?:mailto|tel):/i, '').split('?')[0] ?? '';
  if (/^(?:mailto|tel):/i.test(h)) {
    if (!l) return address;
    return l.replace(/\s/g, '').includes(address.replace(/\s/g, '')) ? l : `${l} (${address})`;
  }
  if (!l) return h;
  return sameTarget(l, h) ? h : `${l} (${h})`;
}

function sameTarget(label: string, url: string): boolean {
  const strip = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/^(?:https?:\/\/|mailto:|tel:)/, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  return strip(label) === strip(url);
}

/**
 * Converts (sanitised) rich text to plain text: `<br>` and paragraph
 * ends become newlines, links become "label (url)".
 */
export function htmlToPlainText(html: string): string {
  const safe = sanitizeEmailHtml(html ?? '');
  if (typeof DOMParser === 'undefined') {
    return decodeBasicEntities(
      safe
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    ).trim();
  }
  const doc = new DOMParser().parseFromString(`<body>${safe}</body>`, 'text/html');
  return walkText(doc.body)
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function walkText(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      out += child.nodeValue ?? '';
      return;
    }
    if (child.nodeType !== 1) return;
    const el = child as Element;
    const tag = el.localName;
    if (tag === 'br') {
      out += '\n';
    } else if (tag === 'p') {
      out += `${walkText(el)}\n`;
    } else if (tag === 'a') {
      out += linkText(walkText(el), el.getAttribute('href') ?? '');
    } else {
      out += walkText(el);
    }
  });
  return out;
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function nonEmpty(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter((l) => l.length > 0);
}

function substitutePlain(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? (variables[name] ?? '') : match,
  );
}

/** Plain-text version of admin-provided footer HTML. */
export function footerHtmlToText(html: string): string {
  return htmlToPlainText(html);
}
