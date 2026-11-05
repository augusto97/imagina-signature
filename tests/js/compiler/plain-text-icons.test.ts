import { describe, expect, it } from 'vitest';
import { compileSignature } from '@/core/compiler/compile';
import { createEmptySchema } from '@/core/schema/signature';
import type { Block } from '@/core/schema/blocks';
import '@/core/blocks';

function text(blocks: Block[], variables: Record<string, string> = {}): string {
  const schema = createEmptySchema();
  schema.blocks = blocks;
  schema.variables = variables;
  return compileSignature(schema).text;
}

describe('plain text of v2 social / contact blocks', () => {
  it('lists contact items with their kind, custom labels and links', () => {
    expect(
      text([
        {
          id: 'c',
          type: 'contact_row',
          items: [
            { id: '1', type: 'email', value: 'jane@acme.example' },
            { id: '2', type: 'mobile', value: '+1 555 100 2000' },
            { id: '3', type: 'website', value: 'acme.example' },
            { id: '4', type: 'address', value: 'Calle Mayor 1, Madrid' },
            { id: '5', type: 'calendar', value: 'cal.example/jane' },
          ],
          style: { font_size: 13, font_weight: 400, color: '#111111' },
        },
      ]),
    ).toBe(
      [
        'Email: jane@acme.example',
        'Mobile: +1 555 100 2000',
        'Web: https://acme.example',
        'Address: Calle Mayor 1, Madrid',
        'Booking link: https://cal.example/jane',
      ].join('\n'),
    );

    expect(
      text(
        [
          {
            id: 'c',
            type: 'contact_row',
            label_mode: 'custom',
            items: [{ id: '1', type: 'phone', value: '{{phone}}', label: 'Office' }],
            style: { font_size: 13, font_weight: 400, color: '#111111' },
          },
        ],
        { phone: '+1 555' },
      ),
    ).toBe('Office: +1 555');
  });

  it('lists linked social networks by name and skips empty ones', () => {
    expect(
      text([
        {
          id: 's',
          type: 'social_icons',
          items: [
            { id: '1', network: 'x', url: 'https://x.com/jane' },
            { id: '2', network: 'bluesky', url: '' },
            { id: '3', network: 'email', url: 'jane@acme.example' },
          ],
        },
      ]),
    ).toBe('X: https://x.com/jane\nEmail: jane@acme.example');
  });
});
