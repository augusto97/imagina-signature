import type { FC } from 'react';
import { __ } from '@/i18n/helpers';
import { Field } from './_shared';

// Font family names are not translated (labels below are brand names).
const WEB_SAFE_FONTS = [
  { value: 'Arial, sans-serif', label: 'Arial' }, // i18n-ignore
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' }, // i18n-ignore
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' }, // i18n-ignore
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' }, // i18n-ignore
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet MS' }, // i18n-ignore
  { value: 'Georgia, serif', label: 'Georgia' }, // i18n-ignore
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' }, // i18n-ignore
  { value: '"Courier New", Courier, monospace', label: 'Courier New' }, // i18n-ignore
] as const;

/** Sentinel `<option>` value for "inherit from the canvas". */
const INHERIT = '__canvas__';

interface BaseProps {
  label: string;
}

interface FixedProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  inheritable?: false;
}

interface InheritableProps extends BaseProps {
  /** `undefined` = use the canvas default font. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Adds a "Canvas default" option that maps to `undefined`. */
  inheritable: true;
  /** Font the canvas default currently resolves to (shown in the option). */
  inheritedValue?: string;
}

type Props = FixedProps | InheritableProps;

/**
 * Restricted to the web-safe font set per CLAUDE.md §20.1. Email
 * clients vary wildly in what fonts they ship; sticking to web-safe
 * stacks keeps the rendered signature identical across Outlook /
 * Gmail / Apple Mail.
 *
 * With `inheritable`, a first "Canvas default" option clears the
 * block's font so it follows the canvas "Default font". A stored stack
 * that isn't in the list (hand-edited JSON, an older template) is kept
 * as its own option instead of silently showing Arial.
 */
export const FontFamilyInput: FC<Props> = (props) => {
  const { label } = props;
  const current = props.value;
  const known = WEB_SAFE_FONTS.some((f) => f.value === current);

  const handle = (raw: string) => {
    if (props.inheritable) {
      props.onChange(raw === INHERIT ? undefined : raw);
    } else if (raw !== INHERIT) {
      props.onChange(raw);
    }
  };

  return (
    <Field label={label}>
      <select
        value={current === undefined ? INHERIT : current}
        onChange={(e) => handle(e.target.value)}
      >
        {props.inheritable && (
          <option value={INHERIT}>
            {props.inheritedValue
              ? __('Canvas default (%s)', fontLabel(props.inheritedValue))
              : __('Canvas default')}
          </option>
        )}
        {current !== undefined && !known && <option value={current}>{fontLabel(current)}</option>}
        {WEB_SAFE_FONTS.map((font) => (
          <option key={font.value} value={font.value}>
            {font.label}
          </option>
        ))}
      </select>
    </Field>
  );
};

/** Human label of a font stack: its first family, unquoted. */
function fontLabel(stack: string): string {
  const match = WEB_SAFE_FONTS.find((f) => normalise(f.value) === normalise(stack));
  if (match) return match.label;
  const first = stack.split(',')[0] ?? stack;
  return first.replace(/['"]/g, '').trim() || stack;
}

function normalise(stack: string): string {
  return stack.replace(/['"\s]/g, '').toLowerCase();
}
