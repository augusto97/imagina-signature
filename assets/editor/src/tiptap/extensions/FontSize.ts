import { Extension } from '@tiptap/react';
import '@tiptap/extension-text-style';

/**
 * Font size as an attribute of the `textStyle` mark (rendered as
 * `<span style="font-size: 18px">`), plus round-tripping of the other
 * span typography the email sanitiser allows (`letter-spacing`,
 * `text-transform`) so content carrying them — templates, pasted
 * signatures — isn't silently stripped the first time it's edited.
 *
 * Only px sizes are accepted (that is all the sanitisers keep).
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      /** Applies a font size (e.g. `'18px'`) to the selection. */
      setFontSize: (size: string) => ReturnType;
      /** Removes the font size from the selection. */
      unsetFontSize: () => ReturnType;
    };
  }
}

const PX = /^\d{1,3}(?:\.\d+)?px$/;
const SPACING = /^(?:normal|-?\d{1,2}(?:\.\d+)?px)$/;
const TRANSFORM = /^(?:none|uppercase|lowercase|capitalize)$/;

function styleAttribute(
  property: string,
  read: (el: HTMLElement) => string,
  valid: RegExp,
): {
  default: null;
  parseHTML: (el: HTMLElement) => string | null;
  renderHTML: (attrs: Record<string, unknown>) => Record<string, string>;
} {
  const key = property.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
  return {
    default: null,
    parseHTML: (el) => {
      const value = read(el).trim().toLowerCase();
      return valid.test(value) ? value : null;
    },
    renderHTML: (attrs) => {
      const value = attrs[key];
      const out: Record<string, string> = {};
      if (typeof value === 'string' && value !== '') out.style = `${property}: ${value}`;
      return out;
    },
  };
}

export const FontSize = Extension.create<{ types: string[] }>({
  name: 'fontSize',

  addOptions() {
    return { types: ['textStyle'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: styleAttribute('font-size', (el) => el.style.fontSize, PX),
          letterSpacing: styleAttribute('letter-spacing', (el) => el.style.letterSpacing, SPACING),
          textTransform: styleAttribute(
            'text-transform',
            (el) => el.style.textTransform,
            TRANSFORM,
          ),
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          PX.test(size) ? chain().setMark('textStyle', { fontSize: size }).run() : false,
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});
