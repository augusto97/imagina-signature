import { describe, expect, it } from 'vitest';
import '@/core/blocks';
import { getRegisteredBlocks } from '@/core/blocks/registry';
import { dynamicStrings } from '@/i18n/dynamic-strings';

/**
 * Block labels / descriptions are translated with `__(definition.label)`,
 * which the static extractor can't see. They must be listed literally in
 * `assets/editor/src/i18n/dynamic-strings.ts` or they never reach the
 * .pot — this guards that list against new / renamed blocks.
 */
describe('dynamic i18n strings', () => {
  const listed = new Set(dynamicStrings());

  it.each(getRegisteredBlocks().map((d) => [d.type, d] as const))(
    'lists the label and description of the "%s" block',
    (_type, definition) => {
      expect(listed).toContain(definition.label);
      expect(listed).toContain(definition.description);
    },
  );
});
