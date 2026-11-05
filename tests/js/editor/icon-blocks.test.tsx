import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ContactRowBlock, SocialIconsBlock } from '@/core/schema/blocks';
import { setAssetsBaseUrl } from '@/core/compiler/assets';
import { SocialIconsBlock as SocialRenderer } from '@/core/blocks/social-icons/SocialIconsBlock';
import { SocialIconsProperties } from '@/core/blocks/social-icons/SocialIconsProperties';
import { ContactRowBlock as ContactRenderer } from '@/core/blocks/contact-row/ContactRowBlock';
import { ContactRowProperties } from '@/core/blocks/contact-row/ContactRowProperties';
import { getBlockDefinition } from '@/core/blocks/registry';
import '@/core/blocks';

const BASE = 'https://acme.example/wp-content/plugins/imagina-signatures';
beforeEach(() => setAssetsBaseUrl(BASE));
afterEach(() => setAssetsBaseUrl(null));

const v1Social: SocialIconsBlock = {
  id: 'soc',
  type: 'social_icons',
  networks: [
    { platform: 'linkedin', url: 'https://linkedin.com/in/jane' },
    { platform: 'twitter', url: '' },
  ],
  icon_size: 24,
  gap: 8,
  color: '#1d4ed8',
};

const v1Contact: ContactRowBlock = {
  id: 'cr',
  type: 'contact_row',
  rows: [{ icon: 'email', label: 'jane@acme.example', href: 'mailto:jane@acme.example' }],
  style: { font_family: 'Arial', font_size: 14, font_weight: 400, color: '#374151' },
};

describe('Social icons block UI', () => {
  it('canvas shows the hosted PNGs, fading items without a link', () => {
    const { container } = render(<SocialRenderer block={v1Social} />);
    const imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual([
      `${BASE}/assets/icons/circle-brand/linkedin.png`,
      `${BASE}/assets/icons/circle-brand/x.png`,
    ]);
    expect(imgs.map((i) => i.getAttribute('alt'))).toEqual(['LinkedIn', 'X']);
    expect((imgs[1]!.parentElement as HTMLElement).style.opacity).toBe('0.35');
    expect(container.textContent).toBe('');
  });

  it('panel converts a v1 block to v2 on the first edit', () => {
    const onChange = vi.fn();
    render(<SocialIconsProperties block={v1Social} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add network'));
    const patch = onChange.mock.calls[0]![0] as Partial<SocialIconsBlock>;
    expect(patch.networks).toBeUndefined();
    expect('networks' in patch).toBe(true);
    expect(patch.items?.map((i) => i.network)).toEqual(['linkedin', 'x', 'facebook']);
    expect(patch).toMatchObject({ shape: 'circle', tone: 'brand', size: 24, spacing: 8 });
  });

  it('panel reorders, edits URLs and switches networks from the icon grid', () => {
    const onChange = vi.fn();
    const v2: SocialIconsBlock = {
      id: 'soc',
      type: 'social_icons',
      items: [
        { id: 'a', network: 'linkedin', url: '' },
        { id: 'b', network: 'github', url: '' },
      ],
    };
    render(<SocialIconsProperties block={v2} onChange={onChange} />);

    fireEvent.click(screen.getAllByLabelText('Move down')[0]!);
    expect(onChange.mock.lastCall![0].items.map((i: { id: string }) => i.id)).toEqual(['b', 'a']);

    fireEvent.change(screen.getByLabelText('LinkedIn link'), {
      target: { value: 'linkedin.com/in/jane' },
    });
    expect(onChange.mock.lastCall![0].items[0].url).toBe('linkedin.com/in/jane');
    expect(screen.getByLabelText('GitHub link')).toHaveAttribute(
      'placeholder',
      'https://github.com/…',
    );

    fireEvent.click(screen.getAllByTitle('Change network')[0]!);
    fireEvent.click(screen.getByLabelText('Bluesky'));
    expect(onChange.mock.lastCall![0].items[0].network).toBe('bluesky');

    fireEvent.click(screen.getByRole('radio', { name: 'Gray' }));
    expect(onChange.mock.lastCall![0].tone).toBe('gray');
  });

  it('new blocks are v2', () => {
    const block = getBlockDefinition('social_icons')!.create() as SocialIconsBlock;
    expect(block.items?.length).toBeGreaterThan(0);
    expect(block.networks).toBeUndefined();
  });
});

describe('Contact block UI', () => {
  it('canvas shows icons and linked values', () => {
    const { container } = render(<ContactRenderer block={v1Contact} />);
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      `${BASE}/assets/icons/plain-dark/email.png`,
    );
    expect(container.querySelector('a')!.getAttribute('href')).toBe('mailto:jane@acme.example');
    expect(container.textContent).toBe('jane@acme.example');
  });

  it('canvas renders the inline layout on one row', () => {
    const block: ContactRowBlock = {
      id: 'cr',
      type: 'contact_row',
      items: [
        { id: 'a', type: 'email', value: 'a@b.example' },
        { id: 'b', type: 'phone', value: '+1 555' },
      ],
      layout: 'inline',
      show_icons: false,
      separator: ' / ',
      style: { font_size: 13, font_weight: 400, color: '#111111' },
    };
    const { container } = render(<ContactRenderer block={block} />);
    expect(container.querySelectorAll('tr')).toHaveLength(2); // wrapper row + the line
    expect(container.textContent?.replace(/ /g, ' ')).toBe('a@b.example / +1 555');
  });

  it('panel converts v1 on the first edit and edits items', () => {
    const onChange = vi.fn();
    render(<ContactRowProperties block={v1Contact} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'One line' }));
    const patch = onChange.mock.lastCall![0] as Partial<ContactRowBlock>;
    expect('rows' in patch && patch.rows === undefined).toBe(true);
    expect(patch.layout).toBe('inline');
    expect(patch.items).toEqual([{ id: 'cr-0', type: 'email', value: 'jane@acme.example' }]);

    // The automatic link is the placeholder of the link override field.
    expect(screen.getByLabelText('Link')).toHaveAttribute(
      'placeholder',
      'mailto:jane@acme.example',
    );

    fireEvent.click(screen.getByText('Add item'));
    expect(onChange.mock.lastCall![0].items.map((i: { type: string }) => i.type)).toEqual([
      'email',
      'phone',
    ]);
  });

  it('new blocks are v2 and follow the canvas font', () => {
    const block = getBlockDefinition('contact_row')!.create() as ContactRowBlock;
    expect(block.items?.length).toBeGreaterThan(0);
    expect(block.rows).toBeUndefined();
    expect(block.style.font_family).toBeUndefined();
  });
});
