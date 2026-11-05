#!/usr/bin/env node
/**
 * `node scripts/templates/build-templates.mjs` — writes the shipped
 * signature templates (`templates/<slug>.json`, schema 1.1).
 *
 * The JSON files are what `DefaultTemplatesSeeder` seeds (and what its
 * hash-based refresh compares), so they are committed; this script is
 * their source. Edit a design here, re-run, review the screenshots
 * (see `tests/js/templates/library.test.ts`, `IMGSIG_TEMPLATE_DUMP`),
 * and commit both.
 *
 * Conventions every template follows (enforced by the library test):
 *  - identity comes from system variables — `{{wp_display_name}}`,
 *    `{{wp_email}}`, `{{company_*}}` (brand kit) — and the template's
 *    own `variables` map holds Spanish example values for the canonical
 *    keys only: job_title, department, phone, mobile, photo_url,
 *    linkedin_url, calendar_url, website_url, address_line;
 *  - images come from `{{company_logo}}`, `{{photo_url}}` or
 *    `{{imgsig_assets_url}}/templates/…` — never a hard-coded host;
 *  - ≤ 600 px wide, web-safe fonts, readable contrast.
 *
 * The catalogue (name, category, description, sort order) lives in
 * `src/Setup/DefaultTemplatesSeeder.php`; `--catalog` prints it as JSON
 * (slug, name, category, description, sort order) to keep META in sync.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  avatar,
  banner,
  button,
  card,
  col,
  contact,
  disclaimer,
  divider,
  heading,
  logo,
  nameHeading,
  qr,
  resetIds,
  row,
  signature,
  social,
  spacer,
  text,
  vcard,
} from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const ARIAL = 'Arial, sans-serif';
const HELVETICA = 'Helvetica, Arial, sans-serif';
const GEORGIA = 'Georgia, serif';
const TIMES = '"Times New Roman", Times, serif';
const TREBUCHET = '"Trebuchet MS", sans-serif';
const VERDANA = 'Verdana, Geneva, sans-serif';
const MONO = '"Courier New", Courier, monospace';

/** Example values (Spanish) for the canonical signature variables. */
const EXAMPLES = {
  job_title: 'Directora de Marketing',
  department: 'Dirección Comercial',
  phone: '+34 910 555 210',
  mobile: '+34 655 210 480',
  photo_url: '{{imgsig_assets_url}}/templates/avatar-1.png',
  linkedin_url: 'https://www.linkedin.com/in/tu-perfil',
  calendar_url: 'https://cal.com/tu-agenda',
  website_url: 'https://www.tuempresa.com',
  address_line: 'Paseo de la Castellana 89, 28046 Madrid',
};

/** The example values for `keys`, with per-template overrides. */
function vars(keys, overrides = {}) {
  const out = {};
  for (const key of keys) out[key] = overrides[key] ?? EXAMPLES[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in out)) out[key] = value;
  }
  return out;
}

const photo = (n) => `{{imgsig_assets_url}}/templates/avatar-${n}.png`;

const LEGAL_NOTICE =
  'Este mensaje y sus anexos son confidenciales y pueden contener información protegida por el secreto profesional. Si lo ha recibido por error, le rogamos que lo comunique al remitente y lo elimine sin copiarlo ni divulgarlo.';
const PRIVACY_NOTICE =
  'Este mensaje es confidencial. Si no es su destinatario, comuníquelo al remitente y elimínelo. Tratamos sus datos conforme a nuestra política de privacidad.';

/** @type {Array<{slug: string, name: string, category: string, description: string, build: () => object}>} */
const TEMPLATES = [
  // -------------------------------------------------------------------------
  // Corporate
  // -------------------------------------------------------------------------
  {
    slug: 'corporate-sidebar',
    name: 'Corporate sidebar',
    category: 'corporate',
    description: 'Round photo beside your details, set off by a slim brand-coloured bar.',
    build: () =>
      signature({
        width: 560,
        textColor: '#0f172a',
        link: '#1d4ed8',
        variables: vars(['job_title', 'department', 'phone', 'photo_url', 'linkedin_url']),
        blocks: [
          row(
            [
              col([avatar({ size: 96 })], { width: 22, valign: 'middle' }),
              col(
                [
                  nameHeading({ size: 19, color: '#0f172a' }),
                  text('{{job_title}} · {{department}}', { size: 13, color: '#475569', pad: [0, 0, 2, 0] }),
                  text('{{company_name}}', {
                    size: 13,
                    weight: 700,
                    color: '#1d4ed8',
                    ls: 1,
                    tt: 'uppercase',
                    pad: [0, 0, 10, 0],
                  }),
                  contact(
                    [
                      ['phone', '{{phone}}'],
                      ['email', '{{wp_email}}'],
                      ['website', '{{company_website}}'],
                    ],
                    { shape: 'circle', tone: 'brand', iconSize: 16, size: 13, color: '#334155', gap: 5 },
                  ),
                  social(
                    [
                      ['linkedin', '{{linkedin_url}}'],
                      ['x', '{{company_x}}'],
                      ['instagram', '{{company_instagram}}'],
                    ],
                    { shape: 'plain', tone: 'gray', size: 18, spacing: 12, pad: [12, 0, 0, 0] },
                  ),
                ],
                { width: 78, valign: 'middle', box: { left: [3, '#1d4ed8'], pad: [2, 0, 2, 18] } },
              ),
            ],
            { gap: 20 },
          ),
        ],
      }),
  },
  {
    slug: 'corporate-band',
    name: 'Corporate band',
    category: 'corporate',
    description: 'Name and contact details over a full-width navy band with your tagline and website.',
    build: () =>
      signature({
        width: 600,
        textColor: '#0b1f3a',
        link: '#1e40af',
        variables: vars(['job_title', 'phone', 'mobile']),
        blocks: [
          row(
            [
              col(
                [
                  nameHeading({ size: 20, color: '#0b1f3a' }),
                  text('{{job_title}}', { size: 13, color: '#475569', pad: [0, 0, 8, 0] }),
                  contact(
                    [
                      ['phone', '{{phone}}'],
                      ['mobile', '{{mobile}}'],
                      ['email', '{{wp_email}}'],
                    ],
                    { layout: 'inline', icons: false, sep: ' · ', size: 12, color: '#334155' },
                  ),
                ],
                { width: 66, valign: 'middle' },
              ),
              col([logo({ width: 128, align: 'right' })], { width: 34, valign: 'middle', box: { align: 'right' } }),
            ],
            { gap: 16, pad: [0, 0, 14, 0] },
          ),
          card(
            [
              row(
                [
                  col(
                    [
                      text('<strong>{{company_name}}</strong>  ·  {{company_tagline}}', {
                        size: 13,
                        color: '#e2e8f0',
                        pad: 0,
                      }),
                    ],
                    { width: 70, valign: 'middle' },
                  ),
                  col(
                    [
                      contact([['website', '{{company_website}}']], {
                        icons: false,
                        size: 13,
                        weight: 700,
                        color: '#ffffff',
                        link: '#ffffff',
                        align: 'right',
                      }),
                    ],
                    { width: 36, valign: 'middle' },
                  ),
                ],
                { gap: 12 },
              ),
            ],
            { bg: '#0b1f3a', pad: [12, 18, 12, 18], radius: 6 },
          ),
        ],
      }),
  },
  {
    slug: 'corporate-logo-split',
    name: 'Logo split',
    category: 'corporate',
    description: 'Company logo, a fine vertical rule, then your details and social links.',
    build: () =>
      signature({
        width: 560,
        textColor: '#111827',
        variables: vars(['job_title', 'phone', 'mobile', 'address_line']),
        blocks: [
          row(
            [
              col([logo({ width: 128, align: 'center' })], { width: 32, valign: 'middle', box: { align: 'center' } }),
              col(
                [
                  nameHeading({ size: 18, color: '#111827' }),
                  text('{{job_title}} · {{company_name}}', { size: 13, color: '#6b7280', pad: [0, 0, 8, 0] }),
                  contact(
                    [
                      ['phone', '{{phone}}'],
                      ['mobile', '{{mobile}}'],
                      ['email', '{{wp_email}}'],
                      ['address', '{{address_line}}'],
                    ],
                    { tone: 'dark', iconSize: 13, size: 12, color: '#374151', gap: 3 },
                  ),
                  social(
                    [
                      ['linkedin', '{{company_linkedin}}'],
                      ['facebook', '{{company_facebook}}'],
                      ['instagram', '{{company_instagram}}'],
                      ['youtube', '{{company_youtube}}'],
                    ],
                    { shape: 'rounded', tone: 'brand', size: 20, spacing: 6, pad: [10, 0, 0, 0] },
                  ),
                ],
                { width: 68, valign: 'middle' },
              ),
            ],
            { gap: 36, divider: [1, '#d1d5db'] },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Minimal
  // -------------------------------------------------------------------------
  {
    slug: 'minimal-one-liner',
    name: 'One-liner',
    category: 'minimal',
    description: 'Two compact lines behind a thin accent rule — ideal for replies and internal mail.',
    build: () =>
      signature({
        width: 600,
        textColor: '#111827',
        link: '#4b5563',
        variables: vars(['job_title', 'phone']),
        blocks: [
          card(
            [
              text('<strong>{{wp_display_name}}</strong>  ·  {{job_title}}, {{company_name}}', {
                size: 13,
                color: '#111827',
                pad: [0, 0, 3, 0],
              }),
              contact(
                [
                  ['phone', '{{phone}}'],
                  ['email', '{{wp_email}}'],
                  ['website', '{{company_website}}'],
                ],
                { layout: 'inline', icons: false, sep: ' · ', size: 12, color: '#4b5563', link: '#4b5563' },
              ),
            ],
            { left: [2, '#111827'], pad: [1, 0, 1, 12] },
          ),
        ],
      }),
  },
  {
    slug: 'minimal-hairline',
    name: 'Hairline',
    category: 'minimal',
    description: 'Swiss-style: spaced capitals, a hairline rule and short labels.',
    build: () =>
      signature({
        width: 520,
        font: HELVETICA,
        textColor: '#111827',
        link: '#111827',
        variables: vars(['job_title', 'phone']),
        blocks: [
          nameHeading({ size: 18, weight: 600, color: '#111827' }),
          text('{{job_title}}', { size: 11, color: '#6b7280', ls: 1.5, tt: 'uppercase', pad: [2, 0, 0, 0] }),
          divider({ px: 28, color: '#111827', pad: [12, 0, 12, 0] }),
          contact(
            [
              ['phone', '{{phone}}'],
              ['email', '{{wp_email}}'],
              ['website', '{{company_website}}'],
            ],
            { icons: false, labels: 'short', size: 12, color: '#374151', gap: 3 },
          ),
          logo({ width: 92, pad: [14, 0, 0, 0] }),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Creative
  // -------------------------------------------------------------------------
  {
    slug: 'creative-card',
    name: 'Lavender card',
    category: 'creative',
    description: 'Rounded tinted card with a rounded-square photo and colourful social icons.',
    build: () =>
      signature({
        width: 560,
        font: TREBUCHET,
        textColor: '#2e1065',
        link: '#6d28d9',
        variables: vars(['job_title', 'mobile', 'photo_url', 'linkedin_url'], {
          job_title: 'Diseñadora de Producto',
          photo_url: photo(5),
        }),
        blocks: [
          card(
            [
              row(
                [
                  col([avatar({ size: 88, shape: 'rounded' })], { width: 24, valign: 'middle' }),
                  col(
                    [
                      nameHeading({ size: 20, color: '#2e1065' }),
                      text('{{job_title}} en <strong>{{company_name}}</strong>', {
                        size: 13,
                        color: '#5b21b6',
                        pad: [0, 0, 8, 0],
                      }),
                      contact(
                        [
                          ['mobile', '{{mobile}}'],
                          ['email', '{{wp_email}}'],
                        ],
                        {
                          layout: 'inline',
                          shape: 'circle',
                          tone: 'brand',
                          iconSize: 16,
                          sep: '   ',
                          size: 13,
                          color: '#3b0764',
                          link: '#3b0764',
                        },
                      ),
                      social(
                        [
                          ['instagram', '{{company_instagram}}'],
                          ['tiktok', '{{company_tiktok}}'],
                          ['linkedin', '{{linkedin_url}}'],
                        ],
                        { shape: 'circle', tone: 'brand', size: 24, spacing: 8, pad: [10, 0, 0, 0] },
                      ),
                    ],
                    { width: 76, valign: 'middle' },
                  ),
                ],
                { gap: 18 },
              ),
            ],
            { bg: '#f5f3ff', radius: 16, pad: [18, 20, 18, 20] },
          ),
        ],
      }),
  },
  {
    slug: 'creative-portfolio',
    name: 'Portfolio',
    category: 'creative',
    description: 'Bold name with a coloured full stop, an accent rule and a link to your work.',
    build: () =>
      signature({
        width: 520,
        textColor: '#111827',
        link: '#be123c',
        variables: vars(['job_title', 'website_url', 'linkedin_url'], {
          job_title: 'Directora de Arte',
          website_url: 'https://www.tuportfolio.com',
        }),
        blocks: [
          heading('{{wp_display_name}}<span style="color:#e11d48">.</span>', { size: 24, color: '#111827', ls: -0.5 }),
          text('{{job_title}} — {{company_name}}', { size: 13, color: '#6b7280' }),
          divider({ px: 40, width: 3, color: '#e11d48', pad: [12, 0, 12, 0] }),
          contact(
            [
              ['email', '{{wp_email}}'],
              ['website', '{{website_url}}'],
            ],
            { layout: 'inline', icons: false, sep: ' / ', size: 13, color: '#374151', link: '#374151' },
          ),
          text('<a href="{{website_url}}"><strong>Ver portfolio →</strong></a>', {
            size: 13,
            color: '#be123c',
            pad: [8, 0, 0, 0],
          }),
          social(
            [
              ['instagram', '{{company_instagram}}'],
              ['linkedin', '{{linkedin_url}}'],
              ['tiktok', '{{company_tiktok}}'],
            ],
            { shape: 'plain', tone: 'dark', size: 18, spacing: 12, pad: [12, 0, 0, 0] },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Sales
  // -------------------------------------------------------------------------
  {
    slug: 'sales-booking',
    name: 'Book a meeting',
    category: 'sales',
    description: 'Photo, direct line and a pill button that opens your booking page.',
    build: () =>
      signature({
        width: 560,
        textColor: '#111827',
        link: '#15803d',
        variables: vars(['job_title', 'mobile', 'photo_url', 'calendar_url'], {
          job_title: 'Ejecutiva de Cuentas',
          photo_url: photo(3),
        }),
        blocks: [
          row(
            [
              col([avatar({ size: 92 })], { width: 21, valign: 'middle' }),
              col(
                [
                  nameHeading({ size: 19, color: '#111827' }),
                  text('{{job_title}} · {{company_name}}', { size: 13, color: '#4b5563', pad: [0, 0, 8, 0] }),
                  contact(
                    [
                      ['mobile', '{{mobile}}'],
                      ['email', '{{wp_email}}'],
                    ],
                    {
                      layout: 'inline',
                      shape: 'circle',
                      tone: 'dark',
                      iconSize: 16,
                      sep: '    ',
                      size: 13,
                      color: '#1f2937',
                      link: '#1f2937',
                    },
                  ),
                  button('Agenda una reunión', '{{calendar_url}}', {
                    preset: 'pill',
                    bg: '#15803d',
                    radius: 999,
                    px: 20,
                    py: 9,
                    pad: [12, 0, 0, 0],
                  }),
                ],
                { width: 79, valign: 'middle' },
              ),
            ],
            { gap: 20 },
          ),
        ],
      }),
  },
  {
    slug: 'sales-whatsapp',
    name: 'WhatsApp first',
    category: 'sales',
    description: 'Logo on top and a tinted call-out inviting customers to message you on WhatsApp.',
    build: () =>
      signature({
        width: 560,
        textColor: '#111827',
        link: '#166534',
        variables: vars(['job_title', 'phone', 'mobile'], { job_title: 'Asesor Comercial' }),
        blocks: [
          logo({ width: 112, pad: [0, 0, 12, 0] }),
          nameHeading({ size: 18, color: '#111827' }),
          text('{{job_title}} · {{company_name}}', { size: 13, color: '#4b5563', pad: [0, 0, 10, 0] }),
          card(
            [
              text('<strong>¿Hablamos?</strong> Te respondo por WhatsApp en minutos.', {
                size: 13,
                color: '#14532d',
                pad: [0, 0, 6, 0],
              }),
              contact(
                [
                  ['whatsapp', '{{mobile}}'],
                  ['phone', '{{phone}}'],
                  ['email', '{{wp_email}}'],
                ],
                {
                  layout: 'inline',
                  shape: 'circle',
                  tone: 'brand',
                  iconSize: 16,
                  sep: '    ',
                  size: 13,
                  color: '#14532d',
                  link: '#14532d',
                },
              ),
            ],
            { bg: '#f0fdf4', left: [3, '#16a34a'], radius: 8, pad: [12, 16, 12, 16] },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Executive
  // -------------------------------------------------------------------------
  {
    slug: 'executive-serif',
    name: 'Executive serif',
    category: 'executive',
    description: 'Understated Georgia type, spaced small capitals and a fine gold rule.',
    build: () =>
      signature({
        width: 560,
        font: GEORGIA,
        textColor: '#1c1917',
        link: '#44403c',
        variables: vars(['job_title', 'phone'], { job_title: 'Consejera Delegada' }),
        blocks: [
          nameHeading({ size: 23, weight: 400, color: '#1c1917', ls: 0.3 }),
          text('{{job_title}}', {
            font: ARIAL,
            size: 11,
            color: '#57534e',
            ls: 2,
            tt: 'uppercase',
            pad: [4, 0, 0, 0],
          }),
          divider({ px: 36, color: '#a16207', pad: [12, 0, 12, 0] }),
          text('{{company_name}}', { size: 14, italic: true, color: '#44403c', pad: [0, 0, 4, 0] }),
          contact(
            [
              ['phone', '{{phone}}'],
              ['email', '{{wp_email}}'],
              ['website', '{{company_website}}'],
            ],
            {
              layout: 'inline',
              icons: false,
              font: ARIAL,
              sep: ' · ',
              size: 12,
              color: '#57534e',
              link: '#57534e',
            },
          ),
        ],
      }),
  },
  {
    slug: 'executive-vcard',
    name: 'Executive with contact card',
    category: 'executive',
    description: 'Logo and details split by a rule, plus a button to save your contact card.',
    build: () =>
      signature({
        width: 560,
        textColor: '#0c0a09',
        link: '#292524',
        variables: vars(['job_title', 'mobile'], { job_title: 'Director General' }),
        blocks: [
          row(
            [
              col([logo({ width: 132, align: 'center' })], { width: 34, valign: 'middle', box: { align: 'center' } }),
              col(
                [
                  nameHeading({ size: 19, color: '#0c0a09' }),
                  text('{{job_title}}', {
                    size: 11,
                    color: '#57534e',
                    ls: 1.5,
                    tt: 'uppercase',
                    pad: [2, 0, 10, 0],
                  }),
                  contact(
                    [
                      ['mobile', '{{mobile}}'],
                      ['email', '{{wp_email}}'],
                      ['website', '{{company_website}}'],
                    ],
                    { tone: 'dark', iconSize: 13, size: 12, color: '#292524', gap: 4 },
                  ),
                  vcard({ bg: '#1c1917', radius: 3, pad: [12, 0, 0, 0] }),
                ],
                { width: 66, valign: 'middle' },
              ),
            ],
            { gap: 36, divider: [1, '#d6d3d1'] },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Tech
  // -------------------------------------------------------------------------
  {
    slug: 'tech-dark-card',
    name: 'Dark mode card',
    category: 'tech',
    description: 'Slate card with a monospace role, cyan links and light icons.',
    build: () =>
      signature({
        width: 560,
        textColor: '#0f172a',
        link: '#0e7490',
        variables: vars(['job_title', 'mobile', 'linkedin_url'], { job_title: 'Ingeniera de Software' }),
        blocks: [
          card(
            [
              nameHeading({ size: 19, color: '#f8fafc' }),
              text('{{job_title}} @ {{company_name}}', {
                font: MONO,
                size: 13,
                color: '#67e8f9',
                pad: [2, 0, 12, 0],
              }),
              contact(
                [
                  ['email', '{{wp_email}}'],
                  ['mobile', '{{mobile}}'],
                  ['website', '{{company_website}}'],
                ],
                {
                  layout: 'inline',
                  tone: 'light',
                  iconSize: 14,
                  sep: '    ',
                  size: 13,
                  color: '#cbd5e1',
                  link: '#e2e8f0',
                },
              ),
              social(
                [
                  ['github', '{{company_github}}'],
                  ['linkedin', '{{linkedin_url}}'],
                  ['x', '{{company_x}}'],
                ],
                { shape: 'rounded', tone: 'light', size: 22, spacing: 8, pad: [14, 0, 0, 0] },
              ),
            ],
            { bg: '#0f172a', radius: 12, pad: [20, 22, 20, 22] },
          ),
        ],
      }),
  },
  {
    slug: 'tech-saas',
    name: 'SaaS trial',
    category: 'tech',
    description: 'Details beside a trial button, with a soft indigo strip for your tagline.',
    build: () =>
      signature({
        width: 600,
        textColor: '#111827',
        link: '#4338ca',
        variables: vars(['job_title', 'phone', 'website_url'], {
          job_title: 'Customer Success Manager',
          website_url: 'https://www.tuempresa.com/prueba',
        }),
        blocks: [
          row(
            [
              col(
                [
                  nameHeading({ size: 18, color: '#111827' }),
                  text('{{job_title}} en <strong>{{company_name}}</strong>', {
                    size: 13,
                    color: '#4b5563',
                    pad: [0, 0, 8, 0],
                  }),
                  contact(
                    [
                      ['email', '{{wp_email}}'],
                      ['phone', '{{phone}}'],
                    ],
                    { layout: 'inline', tone: 'gray', iconSize: 13, sep: '    ', size: 12, color: '#374151' },
                  ),
                ],
                { width: 64, valign: 'middle' },
              ),
              col(
                [
                  button('Prueba gratis 14 días', '{{website_url}}', {
                    bg: '#4f46e5',
                    radius: 8,
                    px: 18,
                    py: 10,
                    align: 'right',
                    pad: 0,
                  }),
                ],
                { width: 36, valign: 'middle', box: { align: 'right' } },
              ),
            ],
            { gap: 16, pad: [0, 0, 14, 0] },
          ),
          card(
            [
              text('{{company_tagline}}  ·  <a href="{{company_website}}"><strong>Descubre más →</strong></a>', {
                size: 12,
                color: '#3730a3',
                pad: 0,
              }),
            ],
            { bg: '#eef2ff', radius: 8, pad: [10, 14, 10, 14] },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Legal / medical
  // -------------------------------------------------------------------------
  {
    slug: 'legal-firm',
    name: 'Law firm',
    category: 'legal',
    description: 'Times type, logo and details split by a rule, labelled contacts and a privilege notice.',
    build: () =>
      signature({
        width: 600,
        font: TIMES,
        textColor: '#111827',
        link: '#7f1d1d',
        variables: vars(['job_title', 'phone', 'address_line'], { job_title: 'Abogada Asociada · Derecho Mercantil' }),
        blocks: [
          row(
            [
              col([logo({ width: 120, align: 'center' })], { width: 28, valign: 'middle', box: { align: 'center' } }),
              col(
                [
                  nameHeading({ size: 20, color: '#111827' }),
                  text('{{job_title}}', { size: 14, italic: true, color: '#4b5563', pad: [0, 0, 8, 0] }),
                  contact(
                    [
                      ['phone', '{{phone}}'],
                      ['email', '{{wp_email}}'],
                      ['website', '{{company_website}}'],
                      ['address', '{{address_line}}'],
                    ],
                    { icons: false, labels: 'short', size: 13, color: '#374151', link: '#374151', gap: 2 },
                  ),
                ],
                { width: 72, valign: 'middle' },
              ),
            ],
            { gap: 32, divider: [1, '#d1d5db'] },
          ),
          divider({ color: '#e5e7eb', pad: [14, 0, 0, 0] }),
          disclaimer(LEGAL_NOTICE, { font: ARIAL, size: 10, color: '#6b7280', pad: [8, 0, 0, 0] }),
        ],
      }),
  },
  {
    slug: 'medical-clinic',
    name: 'Clinic',
    category: 'medical',
    description: 'Calm teal palette, photo, appointment button and a confidentiality note.',
    build: () =>
      signature({
        width: 560,
        textColor: '#134e4a',
        link: '#0f766e',
        variables: vars(['job_title', 'department', 'phone', 'photo_url', 'calendar_url', 'address_line'], {
          job_title: 'Médica especialista en Dermatología',
          department: 'Unidad de Dermatología',
          photo_url: photo(2),
        }),
        blocks: [
          row(
            [
              col([avatar({ size: 88 })], { width: 21, valign: 'top' }),
              col(
                [
                  nameHeading({ size: 19, color: '#134e4a' }),
                  text('{{job_title}}', { size: 13, color: '#0f766e', weight: 700, pad: [0, 0, 2, 0] }),
                  text('{{department}} · {{company_name}}', { size: 12, color: '#4b5563', pad: [0, 0, 8, 0] }),
                  contact(
                    [
                      ['phone', '{{phone}}'],
                      ['email', '{{wp_email}}'],
                      ['address', '{{address_line}}'],
                    ],
                    { tone: 'gray', iconSize: 13, size: 12, color: '#374151', gap: 3 },
                  ),
                  button('Pedir cita', '{{calendar_url}}', { bg: '#0f766e', radius: 6, px: 18, py: 8, pad: [12, 0, 0, 0] }),
                ],
                { width: 79, valign: 'top' },
              ),
            ],
            { gap: 20 },
          ),
          disclaimer(PRIVACY_NOTICE, { size: 10, color: '#6b7280', pad: [14, 0, 0, 0] }),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Real estate
  // -------------------------------------------------------------------------
  {
    slug: 'real-estate-agent',
    name: 'Property agent',
    category: 'real-estate',
    description: 'Three columns: photo, details and a QR code that opens your listings.',
    build: () =>
      signature({
        width: 600,
        textColor: '#0f172a',
        link: '#92400e',
        variables: vars(['job_title', 'mobile', 'photo_url', 'website_url'], {
          job_title: 'Asesora Inmobiliaria',
          photo_url: photo(3),
          website_url: 'https://www.tuinmobiliaria.com/inmuebles',
        }),
        blocks: [
          row(
            [
              col([avatar({ size: 96 })], { width: 20, valign: 'middle' }),
              col(
                [
                  nameHeading({ size: 18, color: '#0f172a' }),
                  text('{{job_title}}', { size: 13, weight: 700, color: '#92400e', pad: [0, 0, 1, 0] }),
                  text('{{company_name}}', { size: 12, color: '#4b5563', pad: [0, 0, 8, 0] }),
                  contact(
                    [
                      ['mobile', '{{mobile}}'],
                      ['email', '{{wp_email}}'],
                    ],
                    { tone: 'dark', iconSize: 13, size: 12, color: '#1f2937', gap: 3 },
                  ),
                  social(
                    [
                      ['instagram', '{{company_instagram}}'],
                      ['facebook', '{{company_facebook}}'],
                      ['whatsapp', '{{company_whatsapp}}'],
                    ],
                    { shape: 'circle', tone: 'brand', size: 20, spacing: 6, pad: [10, 0, 0, 0] },
                  ),
                ],
                { width: 56, valign: 'middle' },
              ),
              col([qr('{{website_url}}', { size: 92, caption: 'Ver inmuebles', align: 'center' })], {
                width: 24,
                valign: 'middle',
                box: { align: 'center' },
              }),
            ],
            { gap: 18, divider: [1, '#e5e7eb'] },
          ),
        ],
      }),
  },
  {
    slug: 'real-estate-luxury',
    name: 'Luxury property',
    category: 'real-estate',
    description: 'Black band with gold capitals above your contact line and a listings button.',
    build: () =>
      signature({
        width: 560,
        font: GEORGIA,
        textColor: '#111111',
        link: '#111111',
        variables: vars(['job_title', 'mobile', 'website_url'], {
          job_title: 'Propiedades Exclusivas',
          website_url: 'https://www.tuinmobiliaria.com/exclusivas',
        }),
        blocks: [
          card(
            [
              nameHeading({ size: 21, weight: 400, color: '#ffffff', ls: 0.5 }),
              text('{{job_title}}  ·  {{company_name}}', {
                font: ARIAL,
                size: 13,
                color: '#e7c98a',
                ls: 1.5,
                tt: 'uppercase',
                pad: [4, 0, 0, 0],
              }),
            ],
            { bg: '#111111', pad: [16, 20, 16, 20] },
          ),
          row(
            [
              col(
                [
                  contact(
                    [
                      ['mobile', '{{mobile}}'],
                      ['email', '{{wp_email}}'],
                    ],
                    { font: ARIAL, tone: 'dark', iconSize: 13, size: 12, color: '#1f2937', gap: 4 },
                  ),
                ],
                { width: 62, valign: 'middle' },
              ),
              col(
                [
                  button('Ver propiedades', '{{website_url}}', {
                    font: ARIAL,
                    preset: 'outline',
                    bg: '#111111',
                    color: '#111111',
                    bw: 1,
                    bc: '#111111',
                    radius: 0,
                    px: 16,
                    py: 8,
                    size: 12,
                    ls: 1,
                    tt: 'uppercase',
                    align: 'right',
                    pad: 0,
                  }),
                ],
                { width: 38, valign: 'middle', box: { align: 'right' } },
              ),
            ],
            { gap: 12, pad: [14, 0, 0, 0] },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Recruiting
  // -------------------------------------------------------------------------
  {
    slug: 'recruiting-hiring',
    name: 'We are hiring',
    category: 'recruiting',
    description: 'Compact signature with a "We are hiring" banner linking to your open positions.',
    build: () =>
      signature({
        width: 600,
        textColor: '#111827',
        link: '#4338ca',
        variables: vars(['job_title', 'phone', 'website_url'], {
          job_title: 'Responsable de Talento',
          website_url: 'https://www.tuempresa.com/empleo',
        }),
        blocks: [
          nameHeading({ size: 18, color: '#111827' }),
          text('{{job_title}} · {{company_name}}', { size: 13, color: '#4b5563', pad: [0, 0, 8, 0] }),
          contact(
            [
              ['email', '{{wp_email}}'],
              ['phone', '{{phone}}'],
            ],
            { layout: 'inline', shape: 'rounded', tone: 'brand', iconSize: 16, sep: '    ', size: 12, color: '#1f2937' },
          ),
          banner('banner-hiring.png', {
            alt: 'Estamos contratando — descubre nuestras vacantes',
            radius: 8,
            pad: [14, 0, 0, 0],
          }),
        ],
      }),
  },
  {
    slug: 'recruiting-recruiter',
    name: 'Recruiter',
    category: 'recruiting',
    description: 'Friendly photo, a short invitation and a button to book an interview.',
    build: () =>
      signature({
        width: 560,
        textColor: '#1e1b4b',
        link: '#6d28d9',
        variables: vars(['job_title', 'mobile', 'photo_url', 'calendar_url', 'linkedin_url'], {
          job_title: 'Talent Acquisition Partner',
          photo_url: photo(5),
        }),
        blocks: [
          row(
            [
              col([avatar({ size: 84, shape: 'rounded' })], { width: 20, valign: 'top' }),
              col(
                [
                  nameHeading({ size: 18, color: '#1e1b4b' }),
                  text('{{job_title}} · {{company_name}}', { size: 13, color: '#4b5563', pad: [0, 0, 6, 0] }),
                  text('Buscamos talento para crecer juntos. ¿Hablamos?', {
                    size: 13,
                    italic: true,
                    color: '#5b21b6',
                    pad: [0, 0, 8, 0],
                  }),
                  contact(
                    [
                      ['email', '{{wp_email}}'],
                      ['mobile', '{{mobile}}'],
                    ],
                    { layout: 'inline', tone: 'gray', iconSize: 13, sep: '    ', size: 12, color: '#374151' },
                  ),
                  row(
                    [
                      col(
                        [
                          button('Agenda una entrevista', '{{calendar_url}}', {
                            bg: '#6d28d9',
                            radius: 6,
                            px: 16,
                            py: 8,
                            pad: 0,
                          }),
                        ],
                        { width: 46, valign: 'middle' },
                      ),
                      col([social([['linkedin', '{{linkedin_url}}']], { shape: 'rounded', size: 26 })], {
                        width: 54,
                        valign: 'middle',
                      }),
                    ],
                    { gap: 8, pad: [12, 0, 0, 0] },
                  ),
                ],
                { width: 80, valign: 'top' },
              ),
            ],
            { gap: 18 },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  {
    slug: 'events-webinar',
    name: 'Webinar promo',
    category: 'events',
    description: 'Your details above a live-webinar banner with a sign-up link.',
    build: () =>
      signature({
        width: 600,
        textColor: '#0f172a',
        link: '#1d4ed8',
        variables: vars(['job_title', 'phone', 'website_url'], { website_url: 'https://www.tuempresa.com/webinar' }),
        blocks: [
          row(
            [
              col(
                [
                  nameHeading({ size: 18, color: '#0f172a' }),
                  text('{{job_title}} · {{company_name}}', { size: 13, color: '#475569', pad: [0, 0, 6, 0] }),
                  contact(
                    [
                      ['email', '{{wp_email}}'],
                      ['phone', '{{phone}}'],
                    ],
                    { layout: 'inline', tone: 'gray', iconSize: 13, sep: '    ', size: 12, color: '#334155' },
                  ),
                ],
                { width: 70, valign: 'middle' },
              ),
              col([logo({ width: 110, align: 'right' })], { width: 30, valign: 'middle', box: { align: 'right' } }),
            ],
            { gap: 12 },
          ),
          banner('banner-webinar.png', { alt: 'Webinar gratuito en directo — inscríbete', radius: 10, pad: [14, 0, 0, 0] }),
        ],
      }),
  },
  {
    slug: 'events-speaker',
    name: 'Next event',
    category: 'events',
    description: 'Rose accents and a tinted call-out announcing your next event.',
    build: () =>
      signature({
        width: 560,
        textColor: '#1f2937',
        link: '#be123c',
        variables: vars(['job_title', 'mobile', 'website_url', 'linkedin_url'], {
          job_title: 'Responsable de Eventos',
          website_url: 'https://www.tuempresa.com/eventos',
        }),
        blocks: [
          nameHeading({ size: 19, color: '#1f2937' }),
          text('{{job_title}} · <strong>{{company_name}}</strong>', { size: 13, color: '#4b5563', pad: [0, 0, 8, 0] }),
          contact(
            [
              ['mobile', '{{mobile}}'],
              ['email', '{{wp_email}}'],
              ['website', '{{company_website}}'],
            ],
            { layout: 'inline', shape: 'circle', tone: 'gray', iconSize: 15, sep: '    ', size: 12, color: '#374151' },
          ),
          card(
            [
              row(
                [
                  col(
                    [
                      text('PRÓXIMO EVENTO', { size: 11, weight: 700, color: '#9f1239', ls: 1.5, pad: [0, 0, 2, 0] }),
                      text('Únete a nuestro próximo encuentro y reserva tu plaza.', {
                        size: 13,
                        color: '#4c0519',
                        pad: 0,
                      }),
                    ],
                    { width: 66, valign: 'middle' },
                  ),
                  col(
                    [
                      button('Reservar plaza', '{{website_url}}', {
                        preset: 'pill',
                        bg: '#be123c',
                        radius: 999,
                        px: 16,
                        py: 8,
                        size: 12,
                        align: 'right',
                        pad: 0,
                      }),
                    ],
                    { width: 34, valign: 'middle', box: { align: 'right' } },
                  ),
                ],
                { gap: 12 },
              ),
            ],
            { bg: '#fff1f2', radius: 10, pad: [12, 16, 12, 16] },
            { pad: [14, 0, 0, 0] },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Education
  // -------------------------------------------------------------------------
  {
    slug: 'education-faculty',
    name: 'Faculty',
    category: 'education',
    description: 'Academic serif layout with institution logo, department and office.',
    build: () =>
      signature({
        width: 560,
        font: GEORGIA,
        textColor: '#1e3a8a',
        link: '#1e40af',
        variables: vars(['job_title', 'department', 'phone', 'address_line'], {
          job_title: 'Profesora Titular',
          department: 'Facultad de Ciencias de la Comunicación',
          address_line: 'Despacho 2.14 · Campus Norte',
        }),
        blocks: [
          row(
            [
              col([logo({ width: 112, align: 'center' })], { width: 28, valign: 'middle', box: { align: 'center' } }),
              col(
                [
                  nameHeading({ size: 19, color: '#1e3a8a' }),
                  text('{{job_title}}', { size: 14, italic: true, color: '#374151' }),
                  text('{{department}} · {{company_name}}', { size: 12, color: '#4b5563', pad: [0, 0, 8, 0] }),
                  contact(
                    [
                      ['phone', '{{phone}}'],
                      ['email', '{{wp_email}}'],
                      ['address', '{{address_line}}'],
                    ],
                    { font: ARIAL, tone: 'gray', iconSize: 13, size: 12, color: '#374151', gap: 3 },
                  ),
                ],
                { width: 72, valign: 'middle' },
              ),
            ],
            { gap: 32, divider: [2, '#1e3a8a'] },
          ),
        ],
      }),
  },
  {
    slug: 'education-school',
    name: 'School',
    category: 'education',
    description: 'Warm, friendly card for teachers and school staff, with family-friendly social links.',
    build: () =>
      signature({
        width: 560,
        font: TREBUCHET,
        textColor: '#422006',
        link: '#854d0e',
        variables: vars(['job_title', 'phone', 'photo_url'], { job_title: 'Tutora de 3.º de Primaria', photo_url: photo(3) }),
        blocks: [
          card(
            [
              row(
                [
                  col([avatar({ size: 80, shape: 'rounded' })], { width: 22, valign: 'middle' }),
                  col(
                    [
                      nameHeading({ size: 19, color: '#422006' }),
                      text('{{job_title}} · {{company_name}}', { size: 13, color: '#854d0e', pad: [0, 0, 8, 0] }),
                      contact(
                        [
                          ['email', '{{wp_email}}'],
                          ['phone', '{{phone}}'],
                        ],
                        {
                          layout: 'inline',
                          shape: 'circle',
                          tone: 'brand',
                          iconSize: 16,
                          sep: '    ',
                          size: 13,
                          color: '#422006',
                          link: '#422006',
                        },
                      ),
                      social(
                        [
                          ['facebook', '{{company_facebook}}'],
                          ['instagram', '{{company_instagram}}'],
                          ['youtube', '{{company_youtube}}'],
                        ],
                        { shape: 'circle', tone: 'brand', size: 22, spacing: 8, pad: [10, 0, 0, 0] },
                      ),
                    ],
                    { width: 78, valign: 'middle' },
                  ),
                ],
                { gap: 18 },
              ),
            ],
            { bg: '#fefce8', border: [1, '#fde68a'], radius: 14, pad: [16, 18, 16, 18] },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Nonprofit
  // -------------------------------------------------------------------------
  {
    slug: 'nonprofit-donate',
    name: 'Donate',
    category: 'nonprofit',
    description: 'Mission line in green, a donation pill button and social links.',
    build: () =>
      signature({
        width: 560,
        textColor: '#14532d',
        link: '#15803d',
        variables: vars(['job_title', 'phone', 'website_url'], {
          job_title: 'Coordinadora de Proyectos',
          website_url: 'https://www.tuorganizacion.org/dona',
        }),
        blocks: [
          logo({ width: 110, pad: [0, 0, 12, 0] }),
          nameHeading({ size: 18, color: '#14532d' }),
          text('{{job_title}} · {{company_name}}', { size: 13, color: '#4b5563' }),
          text('“{{company_tagline}}”', { size: 13, italic: true, color: '#166534', pad: [6, 0, 8, 0] }),
          contact(
            [
              ['email', '{{wp_email}}'],
              ['phone', '{{phone}}'],
            ],
            { layout: 'inline', tone: 'gray', iconSize: 13, sep: '    ', size: 12, color: '#374151' },
          ),
          row(
            [
              col(
                [
                  button('Haz tu donación', '{{website_url}}', {
                    preset: 'pill',
                    bg: '#15803d',
                    radius: 999,
                    px: 20,
                    py: 9,
                    pad: 0,
                  }),
                ],
                { width: 30, valign: 'middle' },
              ),
              col(
                [
                  social(
                    [
                      ['facebook', '{{company_facebook}}'],
                      ['instagram', '{{company_instagram}}'],
                      ['youtube', '{{company_youtube}}'],
                    ],
                    { shape: 'circle', tone: 'brand', size: 22, spacing: 6 },
                  ),
                ],
                { width: 64, valign: 'middle' },
              ),
            ],
            { gap: 8, pad: [12, 0, 0, 0] },
          ),
        ],
      }),
  },
  {
    slug: 'nonprofit-volunteer',
    name: 'Volunteer',
    category: 'nonprofit',
    description: 'Outlined card with your photo and a link inviting readers to volunteer.',
    build: () =>
      signature({
        width: 560,
        textColor: '#1f2937',
        link: '#0f766e',
        variables: vars(['job_title', 'mobile', 'photo_url', 'website_url'], {
          job_title: 'Coordinador de Voluntariado',
          photo_url: photo(2),
          website_url: 'https://www.tuorganizacion.org/voluntariado',
        }),
        blocks: [
          card(
            [
              row(
                [
                  col([avatar({ size: 76 })], { width: 20, valign: 'middle' }),
                  col(
                    [
                      nameHeading({ size: 17, color: '#1f2937' }),
                      text('{{job_title}} · {{company_name}}', { size: 13, color: '#4b5563', pad: [0, 0, 6, 0] }),
                      contact(
                        [
                          ['mobile', '{{mobile}}'],
                          ['email', '{{wp_email}}'],
                        ],
                        { layout: 'inline', tone: 'gray', iconSize: 13, sep: '    ', size: 12, color: '#374151' },
                      ),
                      text('<a href="{{website_url}}"><strong>Hazte voluntario →</strong></a>', {
                        size: 13,
                        color: '#0f766e',
                        pad: [8, 0, 0, 0],
                      }),
                    ],
                    { width: 80, valign: 'middle' },
                  ),
                ],
                { gap: 16 },
              ),
            ],
            { border: [1, '#99f6e4'], radius: 12, pad: [16, 18, 16, 18] },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // E-commerce
  // -------------------------------------------------------------------------
  {
    slug: 'ecommerce-collection',
    name: 'New collection',
    category: 'ecommerce',
    description: 'Logo and details above a "New collection" banner that links to your shop.',
    build: () =>
      signature({
        width: 600,
        textColor: '#1c1917',
        link: '#9a3412',
        variables: vars(['job_title', 'phone'], { job_title: 'Atención al Cliente' }),
        blocks: [
          row(
            [
              col([logo({ width: 120 })], { width: 30, valign: 'middle' }),
              col(
                [
                  nameHeading({ size: 17, color: '#1c1917' }),
                  text('{{job_title}} · {{company_name}}', { size: 12, color: '#57534e', pad: [0, 0, 4, 0] }),
                  contact(
                    [
                      ['email', '{{wp_email}}'],
                      ['phone', '{{phone}}'],
                    ],
                    { layout: 'inline', tone: 'gray', iconSize: 13, sep: '    ', size: 12, color: '#44403c' },
                  ),
                ],
                { width: 70, valign: 'middle' },
              ),
            ],
            { gap: 24, divider: [1, '#e7e5e4'] },
          ),
          banner('banner-collection.png', {
            alt: 'Nueva colección — descúbrela en nuestra tienda online',
            link: '{{company_website}}',
            radius: 8,
            pad: [14, 0, 0, 0],
          }),
          social(
            [
              ['instagram', '{{company_instagram}}'],
              ['tiktok', '{{company_tiktok}}'],
              ['facebook', '{{company_facebook}}'],
            ],
            { shape: 'plain', tone: 'dark', size: 18, spacing: 14, align: 'center', pad: [12, 0, 0, 0] },
          ),
        ],
      }),
  },
  {
    slug: 'ecommerce-support',
    name: 'Customer care',
    category: 'ecommerce',
    description: 'Support signature with WhatsApp, phone and opening hours.',
    build: () =>
      signature({
        width: 560,
        textColor: '#111827',
        link: '#c2410c',
        variables: vars(['job_title', 'mobile'], { job_title: 'Equipo de Atención al Cliente' }),
        blocks: [
          text('ATENCIÓN AL CLIENTE', { size: 11, weight: 700, color: '#c2410c', ls: 1.5, pad: [0, 0, 4, 0] }),
          nameHeading({ size: 18, color: '#111827' }),
          text('{{job_title}} · {{company_name}}', { size: 13, color: '#4b5563', pad: [0, 0, 10, 0] }),
          contact(
            [
              ['whatsapp', '{{mobile}}'],
              ['phone', '{{company_phone}}'],
              ['email', '{{company_email}}'],
            ],
            { shape: 'circle', tone: 'brand', iconSize: 18, size: 13, color: '#1f2937', gap: 6 },
          ),
          text('Lunes a viernes, de 9:00 a 18:00', { size: 12, color: '#6b7280', pad: [8, 0, 10, 0] }),
          logo({ width: 100 }),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Agency
  // -------------------------------------------------------------------------
  {
    slug: 'agency-bold',
    name: 'Bold agency',
    category: 'agency',
    description: 'Big black type with a yellow name tag and dark rounded icons.',
    build: () =>
      signature({
        width: 560,
        font: HELVETICA,
        textColor: '#0a0a0a',
        link: '#0a0a0a',
        variables: vars(['job_title', 'mobile'], { job_title: 'Directora Creativa' }),
        blocks: [
          card(
            [text('{{company_name}}', { size: 12, weight: 700, color: '#0a0a0a', ls: 2, tt: 'uppercase', pad: 0 })],
            { bg: '#facc15', pad: [6, 12, 6, 12] },
            { pad: [0, 0, 10, 0], box: { width: 220 } },
          ),
          nameHeading({ size: 26, color: '#0a0a0a', ls: -0.5, lh: 1.1 }),
          text('{{job_title}}', { size: 14, color: '#404040', pad: [2, 0, 10, 0] }),
          contact(
            [
              ['mobile', '{{mobile}}'],
              ['email', '{{wp_email}}'],
              ['website', '{{company_website}}'],
            ],
            { layout: 'inline', tone: 'dark', iconSize: 13, sep: '    ', size: 12, color: '#171717' },
          ),
          social(
            [
              ['instagram', '{{company_instagram}}'],
              ['linkedin', '{{company_linkedin}}'],
              ['tiktok', '{{company_tiktok}}'],
              ['youtube', '{{company_youtube}}'],
            ],
            { shape: 'rounded', tone: 'dark', size: 22, spacing: 6, pad: [12, 0, 0, 0] },
          ),
        ],
      }),
  },
  {
    slug: 'agency-studio',
    name: 'Studio three columns',
    category: 'agency',
    description: 'Logo, details and "Follow us" icons in three columns split by fine rules.',
    build: () =>
      signature({
        width: 600,
        textColor: '#111827',
        link: '#111827',
        variables: vars(['job_title', 'phone'], { job_title: 'Project Manager' }),
        blocks: [
          row(
            [
              col([logo({ width: 120, align: 'center' })], { width: 28, valign: 'middle', box: { align: 'center' } }),
              col(
                [
                  nameHeading({ size: 17, color: '#111827' }),
                  text('{{job_title}}', { size: 12, color: '#6b7280', pad: [0, 0, 8, 0] }),
                  contact(
                    [
                      ['phone', '{{phone}}'],
                      ['email', '{{wp_email}}'],
                      ['website', '{{company_website}}'],
                    ],
                    { tone: 'dark', iconSize: 12, size: 12, color: '#1f2937', gap: 3 },
                  ),
                ],
                { width: 46, valign: 'middle' },
              ),
              col(
                [
                  text('SÍGUENOS', { size: 11, weight: 700, color: '#6b7280', ls: 1.5, align: 'center', pad: [0, 0, 8, 0] }),
                  social(
                    [
                      ['instagram', '{{company_instagram}}'],
                      ['linkedin', '{{company_linkedin}}'],
                      ['x', '{{company_x}}'],
                    ],
                    { shape: 'circle', tone: 'dark', size: 22, spacing: 6, align: 'center' },
                  ),
                ],
                { width: 26, valign: 'middle', box: { align: 'center' } },
              ),
            ],
            { gap: 24, divider: [1, '#e5e7eb'] },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Consulting / finance
  // -------------------------------------------------------------------------
  {
    slug: 'consulting-partner',
    name: 'Partner',
    category: 'consulting',
    description: 'Details on the left, photo on the right, with a link to book a 30-minute call.',
    build: () =>
      signature({
        width: 500,
        textColor: '#0f3d3e',
        link: '#0f766e',
        variables: vars(['job_title', 'mobile', 'photo_url', 'calendar_url', 'linkedin_url'], {
          job_title: 'Socia Directora',
          photo_url: photo(4),
        }),
        blocks: [
          row(
            [
              col(
                [
                  nameHeading({ size: 19, color: '#0f3d3e' }),
                  text('{{job_title}} · {{company_name}}', { size: 13, color: '#4b5563', pad: [0, 0, 8, 0] }),
                  contact(
                    [
                      ['mobile', '{{mobile}}'],
                      ['email', '{{wp_email}}'],
                      ['website', '{{company_website}}'],
                    ],
                    { tone: 'gray', iconSize: 13, size: 12, color: '#374151', gap: 3 },
                  ),
                  text('<a href="{{calendar_url}}"><strong>Reserva una llamada de 30 min →</strong></a>', {
                    size: 13,
                    color: '#0f766e',
                    pad: [10, 0, 0, 0],
                  }),
                ],
                { width: 74, valign: 'middle', box: { left: [3, '#0f766e'], pad: [2, 0, 2, 16] } },
              ),
              col(
                [
                  avatar({ size: 96, align: 'center' }),
                  social([['linkedin', '{{linkedin_url}}']], { shape: 'rounded', size: 20, align: 'center', pad: [8, 0, 0, 0] }),
                ],
                { width: 26, valign: 'middle', box: { align: 'center' } },
              ),
            ],
            { gap: 16 },
          ),
        ],
      }),
  },
  {
    slug: 'finance-advisor',
    name: 'Financial advisor',
    category: 'finance',
    description: 'Navy and gold: logo, a gold rule, labelled contacts and a regulatory notice.',
    build: () =>
      signature({
        width: 600,
        font: GEORGIA,
        textColor: '#102a43',
        link: '#102a43',
        variables: vars(['job_title', 'phone', 'mobile'], { job_title: 'Asesor Financiero Certificado' }),
        blocks: [
          row(
            [
              col([logo({ width: 120, align: 'center' })], { width: 28, valign: 'middle', box: { align: 'center' } }),
              col(
                [
                  nameHeading({ size: 19, color: '#102a43' }),
                  text('{{job_title}}', {
                    font: ARIAL,
                    size: 11,
                    weight: 700,
                    color: '#92400e',
                    ls: 1.2,
                    tt: 'uppercase',
                    pad: [2, 0, 8, 0],
                  }),
                  contact(
                    [
                      ['phone', '{{phone}}'],
                      ['mobile', '{{mobile}}'],
                      ['email', '{{wp_email}}'],
                      ['website', '{{company_website}}'],
                    ],
                    { font: ARIAL, icons: false, labels: 'short', size: 12, color: '#243b53', gap: 2 },
                  ),
                ],
                { width: 72, valign: 'middle' },
              ),
            ],
            { gap: 32, divider: [2, '#b7791f'] },
          ),
          disclaimer(
            'La información de este mensaje no constituye asesoramiento financiero personalizado. Rentabilidades pasadas no garantizan rentabilidades futuras.',
            { font: ARIAL, size: 10, color: '#64748b', pad: [14, 0, 0, 0] },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Hospitality
  // -------------------------------------------------------------------------
  {
    slug: 'hospitality-hotel',
    name: 'Boutique hotel',
    category: 'hospitality',
    description: 'Centred, elegant layout with a booking button and the hotel address.',
    build: () =>
      signature({
        width: 520,
        font: GEORGIA,
        textColor: '#3f2d20',
        link: '#7c2d12',
        variables: vars(['job_title', 'phone', 'website_url', 'address_line'], {
          job_title: 'Guest Relations Manager',
          website_url: 'https://www.tuhotel.com/reservas',
          address_line: 'Calle del Prado 12, 28014 Madrid',
        }),
        blocks: [
          logo({ width: 120, align: 'center', pad: [0, 0, 12, 0] }),
          nameHeading({ size: 19, color: '#3f2d20', align: 'center' }),
          text('{{job_title}}', {
            font: ARIAL,
            size: 11,
            color: '#7c5c3b',
            ls: 1.5,
            tt: 'uppercase',
            align: 'center',
            pad: [3, 0, 0, 0],
          }),
          divider({ px: 40, color: '#c2a27c', align: 'center', pad: [12, 0, 12, 0] }),
          contact(
            [
              ['phone', '{{phone}}'],
              ['email', '{{wp_email}}'],
            ],
            { layout: 'inline', icons: false, font: ARIAL, sep: ' · ', size: 12, color: '#57534e', align: 'center' },
          ),
          text('{{address_line}}', { font: ARIAL, size: 12, color: '#57534e', align: 'center', pad: [3, 0, 0, 0] }),
          button('Reserva tu estancia', '{{website_url}}', {
            font: ARIAL,
            bg: '#7c2d12',
            radius: 2,
            px: 20,
            py: 9,
            size: 12,
            ls: 1,
            tt: 'uppercase',
            align: 'center',
            pad: [14, 0, 0, 0],
          }),
          social(
            [
              ['instagram', '{{company_instagram}}'],
              ['facebook', '{{company_facebook}}'],
            ],
            { shape: 'plain', tone: 'dark', size: 18, spacing: 12, align: 'center', pad: [12, 0, 0, 0] },
          ),
        ],
      }),
  },
  {
    slug: 'hospitality-restaurant',
    name: 'Restaurant',
    category: 'hospitality',
    description: 'Warm tinted card with logo, address and a "Book a table" button.',
    build: () =>
      signature({
        width: 560,
        textColor: '#431407',
        link: '#9a3412',
        variables: vars(['job_title', 'phone', 'website_url', 'address_line'], {
          job_title: 'Jefa de Sala',
          website_url: 'https://www.turestaurante.com/reservas',
          address_line: 'Plaza Mayor 4, 37002 Salamanca',
        }),
        blocks: [
          card(
            [
              row(
                [
                  col([logo({ width: 112, align: 'center' })], { width: 30, valign: 'middle', box: { align: 'center' } }),
                  col(
                    [
                      nameHeading({ size: 18, color: '#431407' }),
                      text('{{job_title}} · {{company_name}}', { size: 13, color: '#9a3412', pad: [0, 0, 8, 0] }),
                      contact(
                        [
                          ['phone', '{{phone}}'],
                          ['address', '{{address_line}}'],
                        ],
                        { tone: 'dark', iconSize: 13, size: 12, color: '#431407', link: '#431407', gap: 3 },
                      ),
                      button('Reserva tu mesa', '{{website_url}}', {
                        bg: '#9a3412',
                        radius: 6,
                        px: 16,
                        py: 8,
                        size: 12,
                        pad: [12, 0, 0, 0],
                      }),
                    ],
                    { width: 70, valign: 'middle' },
                  ),
                ],
                { gap: 20, divider: [1, '#fed7aa'] },
              ),
            ],
            { bg: '#fff7ed', radius: 12, pad: [16, 18, 16, 18] },
          ),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Campaign
  // -------------------------------------------------------------------------
  {
    slug: 'campaign-launch',
    name: 'Product launch',
    category: 'campaign',
    description: 'Compact details plus an indigo announcement strip with a "Discover" link.',
    build: () =>
      signature({
        width: 560,
        textColor: '#111827',
        link: '#4338ca',
        variables: vars(['job_title', 'phone', 'website_url'], { website_url: 'https://www.tuempresa.com/novedades' }),
        blocks: [
          nameHeading({ size: 18, color: '#111827' }),
          text('{{job_title}} · {{company_name}}', { size: 13, color: '#4b5563', pad: [0, 0, 6, 0] }),
          contact(
            [
              ['phone', '{{phone}}'],
              ['email', '{{wp_email}}'],
              ['website', '{{company_website}}'],
            ],
            { layout: 'inline', tone: 'gray', iconSize: 13, sep: '    ', size: 12, color: '#374151' },
          ),
          card(
            [
              row(
                [
                  col(
                    [
                      text('<strong>Novedad</strong>  ·  Descubre la nueva versión de nuestra plataforma.', {
                        size: 13,
                        color: '#312e81',
                        pad: 0,
                      }),
                    ],
                    { width: 74, valign: 'middle' },
                  ),
                  col(
                    [
                      button('Descubrir →', '{{website_url}}', {
                        preset: 'text',
                        bg: '#4338ca',
                        color: '#4338ca',
                        size: 13,
                        weight: 700,
                        px: 0,
                        py: 0,
                        align: 'right',
                        pad: 0,
                      }),
                    ],
                    { width: 26, valign: 'middle', box: { align: 'right' } },
                  ),
                ],
                { gap: 12 },
              ),
            ],
            { bg: '#eef2ff', left: [4, '#4f46e5'], radius: 8, pad: [12, 16, 12, 16] },
            { pad: [14, 0, 0, 0] },
          ),
        ],
      }),
  },
  {
    slug: 'campaign-banner',
    name: 'Campaign banner',
    category: 'campaign',
    description: 'Logo and details split by a rule, with a full-width promotional banner below.',
    build: () =>
      signature({
        width: 600,
        textColor: '#0f172a',
        link: '#1d4ed8',
        variables: vars(['job_title', 'mobile', 'website_url'], { website_url: 'https://www.tuempresa.com/webinar' }),
        blocks: [
          row(
            [
              col([logo({ width: 116, align: 'center' })], { width: 28, valign: 'middle', box: { align: 'center' } }),
              col(
                [
                  nameHeading({ size: 18, color: '#0f172a' }),
                  text('{{job_title}}', { size: 13, color: '#475569', pad: [0, 0, 6, 0] }),
                  contact(
                    [
                      ['mobile', '{{mobile}}'],
                      ['email', '{{wp_email}}'],
                    ],
                    { layout: 'inline', shape: 'circle', tone: 'brand', iconSize: 15, sep: '    ', size: 12, color: '#1e293b' },
                  ),
                ],
                { width: 72, valign: 'middle' },
              ),
            ],
            { gap: 28, divider: [1, '#cbd5e1'] },
          ),
          banner('banner-webinar.png', { alt: 'Webinar gratuito en directo — inscríbete', pad: [16, 0, 0, 0] }),
        ],
      }),
  },

  // -------------------------------------------------------------------------
  // Upgraded 1.0 templates (slugs kept)
  // -------------------------------------------------------------------------
  {
    slug: 'minimal-modern',
    name: 'Minimal Modern',
    category: 'minimal',
    description: 'Single column, generous spacing, sans-serif.',
    build: () =>
      signature({
        width: 520,
        textColor: '#111827',
        link: '#111827',
        variables: vars(['job_title', 'phone'], { job_title: 'Diseñadora de Producto' }),
        blocks: [
          nameHeading({ size: 20, color: '#111827', ls: -0.2 }),
          text('{{job_title}} · {{company_name}}', { size: 13, color: '#6b7280' }),
          divider({ color: '#e5e7eb', pad: [14, 0, 14, 0] }),
          contact(
            [
              ['email', '{{wp_email}}'],
              ['phone', '{{phone}}'],
              ['website', '{{company_website}}'],
            ],
            { tone: 'gray', iconSize: 14, size: 13, color: '#374151', gap: 6 },
          ),
        ],
      }),
  },
  {
    slug: 'corporate-classic',
    name: 'Corporate Classic',
    category: 'corporate',
    description: 'Serif typography with a short rule.',
    build: () =>
      signature({
        width: 560,
        font: GEORGIA,
        textColor: '#1f2937',
        link: '#1e3a8a',
        variables: vars(['job_title', 'department', 'phone']),
        blocks: [
          nameHeading({ size: 21, color: '#1f2937' }),
          text('{{job_title}}, {{department}}', { size: 14, italic: true, color: '#4b5563', pad: [2, 0, 0, 0] }),
          divider({ px: 48, width: 2, color: '#1e3a8a', pad: [12, 0, 12, 0] }),
          text('{{company_name}}', {
            font: ARIAL,
            size: 12,
            weight: 700,
            color: '#1e3a8a',
            ls: 1.5,
            tt: 'uppercase',
            pad: [0, 0, 4, 0],
          }),
          contact(
            [
              ['phone', '{{phone}}'],
              ['email', '{{wp_email}}'],
              ['website', '{{company_website}}'],
            ],
            { layout: 'inline', icons: false, font: ARIAL, sep: ' · ', size: 12, color: '#4b5563', link: '#4b5563' },
          ),
          logo({ width: 104, pad: [14, 0, 0, 0] }),
        ],
      }),
  },
  {
    slug: 'sales-active',
    name: 'Sales Active',
    category: 'sales',
    description: 'Conversion-focused with a CTA button.',
    build: () =>
      signature({
        width: 560,
        textColor: '#0f172a',
        link: '#2563eb',
        variables: vars(['job_title', 'phone', 'mobile', 'calendar_url'], { job_title: 'Gerente Comercial' }),
        blocks: [
          nameHeading({ size: 19, color: '#0f172a' }),
          text('{{job_title}} · <strong>{{company_name}}</strong>', { size: 13, color: '#475569', pad: [0, 0, 8, 0] }),
          contact(
            [
              ['mobile', '{{mobile}}'],
              ['phone', '{{phone}}'],
              ['email', '{{wp_email}}'],
            ],
            { layout: 'inline', shape: 'circle', tone: 'brand', iconSize: 16, sep: '    ', size: 12, color: '#1e293b' },
          ),
          button('Agenda una demo', '{{calendar_url}}', { bg: '#2563eb', radius: 6, px: 20, py: 10, pad: [14, 0, 0, 0] }),
        ],
      }),
  },
  {
    slug: 'medical',
    name: 'Medical',
    category: 'medical',
    description: 'Professional credentials with a confidentiality disclaimer.',
    build: () =>
      signature({
        width: 560,
        textColor: '#083344',
        link: '#0e7490',
        variables: vars(['job_title', 'department', 'phone', 'address_line'], {
          job_title: 'Médico Especialista en Cardiología',
          department: 'Servicio de Cardiología',
        }),
        blocks: [
          card(
            [
              nameHeading({ size: 19, color: '#083344' }),
              text('{{job_title}}', { size: 13, weight: 700, color: '#0e7490', pad: [0, 0, 2, 0] }),
              text('{{department}} · {{company_name}}', { size: 12, color: '#4b5563', pad: [0, 0, 8, 0] }),
              contact(
                [
                  ['phone', '{{phone}}'],
                  ['email', '{{wp_email}}'],
                  ['address', '{{address_line}}'],
                ],
                { tone: 'gray', iconSize: 13, size: 12, color: '#374151', gap: 3 },
              ),
            ],
            { left: [3, '#0e7490'], pad: [2, 0, 2, 16] },
          ),
          disclaimer(PRIVACY_NOTICE, { size: 10, color: '#6b7280', pad: [14, 0, 0, 0] }),
        ],
      }),
  },
  {
    slug: 'legal',
    name: 'Legal',
    category: 'legal',
    description: 'Serif type with a long privilege disclaimer.',
    build: () =>
      signature({
        width: 600,
        font: GEORGIA,
        textColor: '#1f2937',
        link: '#7f1d1d',
        variables: vars(['job_title', 'phone', 'address_line'], { job_title: 'Socio · Derecho Procesal' }),
        blocks: [
          nameHeading({ size: 20, color: '#1f2937' }),
          text('{{job_title}}', { size: 14, italic: true, color: '#4b5563' }),
          text('{{company_name}}', {
            font: ARIAL,
            size: 12,
            weight: 700,
            color: '#7f1d1d',
            ls: 1.5,
            tt: 'uppercase',
            pad: [8, 0, 4, 0],
          }),
          contact(
            [
              ['phone', '{{phone}}'],
              ['email', '{{wp_email}}'],
              ['address', '{{address_line}}'],
            ],
            { layout: 'inline', icons: false, font: ARIAL, sep: ' · ', size: 12, color: '#4b5563', link: '#4b5563' },
          ),
          divider({ color: '#d1d5db', pad: [14, 0, 0, 0] }),
          disclaimer(LEGAL_NOTICE, { font: ARIAL, size: 10, color: '#6b7280', pad: [8, 0, 0, 0] }),
        ],
      }),
  },
  {
    slug: 'creative',
    name: 'Creative',
    category: 'creative',
    description: 'Vibrant accent colours and social icons.',
    build: () =>
      signature({
        width: 560,
        font: TREBUCHET,
        textColor: '#111827',
        link: '#7c3aed',
        variables: vars(['job_title', 'mobile', 'linkedin_url'], { job_title: 'Content Creator' }),
        blocks: [
          heading('{{wp_display_name}}', { size: 22, color: '#111827' }),
          text('<span style="color:#7c3aed">●</span> {{job_title}}  <span style="color:#db2777">●</span> {{company_name}}', {
            size: 13,
            color: '#374151',
            pad: [2, 0, 10, 0],
          }),
          contact(
            [
              ['mobile', '{{mobile}}'],
              ['email', '{{wp_email}}'],
            ],
            { layout: 'inline', shape: 'circle', tone: 'brand', iconSize: 16, sep: '    ', size: 13, color: '#1f2937' },
          ),
          social(
            [
              ['instagram', '{{company_instagram}}'],
              ['tiktok', '{{company_tiktok}}'],
              ['youtube', '{{company_youtube}}'],
              ['x', '{{company_x}}'],
              ['linkedin', '{{linkedin_url}}'],
            ],
            { shape: 'circle', tone: 'brand', size: 26, spacing: 8, pad: [12, 0, 0, 0] },
          ),
        ],
      }),
  },
  {
    slug: 'developer',
    name: 'Developer',
    category: 'tech',
    description: 'Monospace type with a GitHub link.',
    build: () =>
      signature({
        width: 560,
        font: MONO,
        textColor: '#111827',
        link: '#1d4ed8',
        variables: vars(['job_title', 'linkedin_url'], { job_title: 'Desarrolladora Full Stack' }),
        blocks: [
          heading('<span style="color:#16a34a">&gt;</span> {{wp_display_name}}', { size: 18, color: '#111827' }),
          text('{{job_title}} @ {{company_name}}', { size: 13, color: '#4b5563', pad: [2, 0, 10, 0] }),
          contact(
            [
              ['email', '{{wp_email}}', 'mail:'],
              ['website', '{{company_website}}', 'web: '],
            ],
            { icons: false, labels: 'custom', size: 13, color: '#374151', gap: 2 },
          ),
          social(
            [
              ['github', '{{company_github}}'],
              ['linkedin', '{{linkedin_url}}'],
            ],
            { shape: 'rounded', tone: 'dark', size: 22, spacing: 6, pad: [12, 0, 0, 0] },
          ),
        ],
      }),
  },
  {
    slug: 'tech-startup',
    name: 'Tech Startup',
    category: 'tech',
    description: 'Modern type with a product CTA.',
    build: () =>
      signature({
        width: 560,
        font: VERDANA,
        textColor: '#111827',
        link: '#4338ca',
        variables: vars(['job_title', 'mobile', 'website_url'], {
          job_title: 'Cofundadora y CTO',
          website_url: 'https://www.tuempresa.com/producto',
        }),
        blocks: [
          logo({ width: 110, pad: [0, 0, 12, 0] }),
          nameHeading({ size: 17, color: '#111827' }),
          text('{{job_title}}', { size: 12, color: '#4b5563', pad: [2, 0, 8, 0] }),
          contact(
            [
              ['mobile', '{{mobile}}'],
              ['email', '{{wp_email}}'],
            ],
            { layout: 'inline', tone: 'gray', iconSize: 13, sep: '    ', size: 12, color: '#374151' },
          ),
          button('Conoce el producto →', '{{website_url}}', {
            preset: 'outline',
            bg: '#4338ca',
            color: '#4338ca',
            bw: 1,
            bc: '#4338ca',
            radius: 8,
            px: 16,
            py: 8,
            size: 12,
            pad: [12, 0, 0, 0],
          }),
        ],
      }),
  },
  {
    slug: 'consultant',
    name: 'Consultant',
    category: 'consulting',
    description: 'Credentials front-and-centre with LinkedIn.',
    build: () =>
      signature({
        width: 560,
        textColor: '#1f2937',
        link: '#0a66c2',
        variables: vars(['job_title', 'mobile', 'linkedin_url'], { job_title: 'Consultora de Estrategia · MBA, PMP' }),
        blocks: [
          nameHeading({ size: 19, color: '#1f2937' }),
          text('{{job_title}}', { size: 13, weight: 700, color: '#0a66c2', pad: [0, 0, 2, 0] }),
          text('{{company_name}}', { size: 13, color: '#4b5563', pad: [0, 0, 8, 0] }),
          contact(
            [
              ['mobile', '{{mobile}}'],
              ['email', '{{wp_email}}'],
            ],
            { layout: 'inline', tone: 'gray', iconSize: 13, sep: '    ', size: 12, color: '#374151' },
          ),
          button('Conecta en LinkedIn', '{{linkedin_url}}', {
            bg: '#0a66c2',
            radius: 4,
            px: 16,
            py: 8,
            size: 12,
            pad: [12, 0, 0, 0],
          }),
        ],
      }),
  },
  {
    slug: 'e-commerce',
    name: 'E-commerce',
    category: 'ecommerce',
    description: 'Shop CTA + social icons for storefront teams.',
    build: () =>
      signature({
        width: 560,
        textColor: '#111827',
        link: '#c2410c',
        variables: vars(['job_title', 'phone'], { job_title: 'Responsable de Tienda Online' }),
        blocks: [
          row(
            [
              col(
                [
                  nameHeading({ size: 18, color: '#111827' }),
                  text('{{job_title}} · {{company_name}}', { size: 13, color: '#4b5563', pad: [0, 0, 8, 0] }),
                  contact(
                    [
                      ['email', '{{wp_email}}'],
                      ['phone', '{{phone}}'],
                    ],
                    { layout: 'inline', tone: 'gray', iconSize: 13, sep: '    ', size: 12, color: '#374151' },
                  ),
                  row(
                    [
                      col(
                        [
                          button('Visita la tienda', '{{company_website}}', {
                            bg: '#c2410c',
                            radius: 6,
                            px: 16,
                            py: 8,
                            size: 12,
                            pad: 0,
                          }),
                        ],
                        { width: 40, valign: 'middle' },
                      ),
                      col(
                        [
                          social(
                            [
                              ['instagram', '{{company_instagram}}'],
                              ['tiktok', '{{company_tiktok}}'],
                              ['facebook', '{{company_facebook}}'],
                            ],
                            { shape: 'circle', tone: 'brand', size: 24, spacing: 6 },
                          ),
                        ],
                        { width: 60, valign: 'middle' },
                      ),
                    ],
                    { gap: 8, pad: [12, 0, 0, 0] },
                  ),
                ],
                { width: 70, valign: 'middle' },
              ),
              col([logo({ width: 120, align: 'right' })], { width: 30, valign: 'middle', box: { align: 'right' } }),
            ],
            { gap: 16 },
          ),
        ],
      }),
  },
  {
    slug: 'logo-left',
    name: 'Logo + info (2-column)',
    category: 'corporate',
    description: 'Square logo on the left, name / role / contact / socials on the right.',
    build: () =>
      signature({
        width: 560,
        textColor: '#0f172a',
        link: '#1d4ed8',
        variables: vars(['job_title', 'phone']),
        blocks: [
          row(
            [
              col([logo({ width: 84, align: 'center' })], {
                width: 22,
                valign: 'middle',
                box: { align: 'center', bg: '#f1f5f9', radius: 10, pad: [14, 8, 14, 8] },
              }),
              col(
                [
                  nameHeading({ size: 18, color: '#0f172a' }),
                  text('{{job_title}} · {{company_name}}', { size: 13, color: '#475569', pad: [0, 0, 8, 0] }),
                  contact(
                    [
                      ['email', '{{wp_email}}'],
                      ['phone', '{{phone}}'],
                    ],
                    { layout: 'inline', shape: 'rounded', tone: 'brand', iconSize: 15, sep: '    ', size: 12, color: '#1e293b' },
                  ),
                  social(
                    [
                      ['linkedin', '{{company_linkedin}}'],
                      ['x', '{{company_x}}'],
                      ['instagram', '{{company_instagram}}'],
                    ],
                    { shape: 'circle', tone: 'dark', size: 20, spacing: 6, pad: [10, 0, 0, 0] },
                  ),
                ],
                { width: 78, valign: 'middle' },
              ),
            ],
            { gap: 20 },
          ),
        ],
      }),
  },
  {
    slug: 'avatar-pro',
    name: 'Avatar + info (2-column)',
    category: 'corporate',
    description: 'Round profile photo + role on the left, contacts and socials on the right.',
    build: () =>
      signature({
        width: 560,
        textColor: '#0f172a',
        link: '#0369a1',
        variables: vars(['job_title', 'phone', 'mobile', 'photo_url', 'linkedin_url'], {
          job_title: 'Product Manager',
          photo_url: photo(1),
        }),
        blocks: [
          row(
            [
              col(
                [
                  avatar({ size: 84, align: 'center', pad: [0, 0, 8, 0] }),
                  nameHeading({ size: 16, color: '#0f172a', align: 'center' }),
                  text('{{job_title}}', { size: 12, color: '#0369a1', align: 'center' }),
                ],
                { width: 40, valign: 'middle', box: { align: 'center' } },
              ),
              col(
                [
                  text('{{company_name}}', {
                    size: 11,
                    weight: 700,
                    color: '#475569',
                    ls: 1.5,
                    tt: 'uppercase',
                    pad: [0, 0, 8, 0],
                  }),
                  contact(
                    [
                      ['email', '{{wp_email}}'],
                      ['phone', '{{phone}}'],
                      ['mobile', '{{mobile}}'],
                      ['website', '{{company_website}}'],
                    ],
                    { shape: 'circle', tone: 'brand', iconSize: 16, size: 12, color: '#1e293b', gap: 5 },
                  ),
                  social(
                    [
                      ['linkedin', '{{linkedin_url}}'],
                      ['x', '{{company_x}}'],
                      ['instagram', '{{company_instagram}}'],
                    ],
                    { shape: 'circle', tone: 'brand', size: 22, spacing: 6, pad: [12, 0, 0, 0] },
                  ),
                ],
                { width: 60, valign: 'middle' },
              ),
            ],
            { gap: 28, divider: [1, '#e2e8f0'] },
          ),
        ],
      }),
  },
  {
    slug: 'two-col-balanced',
    name: 'Balanced split (2-column)',
    category: 'consulting',
    description: 'Headline + tagline on the left, contacts + Book-a-call CTA on the right.',
    build: () =>
      signature({
        width: 600,
        textColor: '#111827',
        link: '#0f766e',
        variables: vars(['job_title', 'mobile', 'calendar_url'], { job_title: 'Consultor Senior' }),
        blocks: [
          row(
            [
              col(
                [
                  nameHeading({ size: 20, color: '#111827' }),
                  text('{{job_title}}', { size: 13, weight: 700, color: '#0f766e', pad: [0, 0, 6, 0] }),
                  text('{{company_name}} — {{company_tagline}}', { size: 12, color: '#4b5563', pad: 0 }),
                ],
                { width: 52, valign: 'middle' },
              ),
              col(
                [
                  contact(
                    [
                      ['mobile', '{{mobile}}'],
                      ['email', '{{wp_email}}'],
                      ['website', '{{company_website}}'],
                    ],
                    { tone: 'gray', iconSize: 13, size: 12, color: '#374151', gap: 3 },
                  ),
                  button('Reserva una llamada', '{{calendar_url}}', {
                    bg: '#0f766e',
                    radius: 6,
                    px: 16,
                    py: 8,
                    size: 12,
                    pad: [10, 0, 0, 0],
                  }),
                ],
                { width: 48, valign: 'middle' },
              ),
            ],
            { gap: 28, divider: [1, '#d1d5db'] },
          ),
        ],
      }),
  },
];

/**
 * Picker order ("All"): a varied first screen, then the rest grouped by
 * category in the order they are defined above.
 */
const FEATURED = [
  'corporate-sidebar',
  'creative-card',
  'sales-booking',
  'corporate-logo-split',
  'tech-dark-card',
  'real-estate-agent',
  'minimal-modern',
  'executive-vcard',
  'campaign-launch',
  'recruiting-hiring',
  'avatar-pro',
  'minimal-one-liner',
];

const ORDERED = [
  ...FEATURED.map((slug) => TEMPLATES.find((t) => t.slug === slug)),
  ...TEMPLATES.filter((t) => !FEATURED.includes(t.slug)),
];

/** Catalogue rows (sort order in steps of 10). */
export const CATALOG = ORDERED.map(({ slug, name, category, description }, index) => ({
  slug,
  name,
  category,
  description,
  sort_order: (index + 1) * 10,
}));

export function buildAll() {
  return TEMPLATES.map((t) => {
    resetIds();
    return { slug: t.slug, json: t.build() };
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--catalog')) {
    console.log(JSON.stringify(CATALOG, null, 2));
  } else {
    for (const { slug, json } of buildAll()) {
      writeFileSync(resolve(ROOT, 'templates', `${slug}.json`), `${JSON.stringify(json, null, 2)}\n`);
    }
    console.log(`${TEMPLATES.length} templates written to templates/`);
  }
}
