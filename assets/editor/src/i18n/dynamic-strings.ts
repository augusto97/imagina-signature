import { __ } from './helpers';

/**
 * Strings the editor translates DYNAMICALLY — `__(definition.label)`,
 * `__(description)` — listed as literal `__()` calls so
 * `npm run i18n:pot` (which only extracts literals) puts them in the
 * catalogue.
 *
 * Never imported by the app: it exists for the extractor and for
 * `tests/js/i18n/dynamic-strings.test.ts`, which fails when a
 * registered block's label or description is missing here. When you
 * add a block (or rename one), add its label and description below and
 * re-run `npm run i18n:pot && npm run i18n:update`.
 *
 * Call sites that translate a registry value are tagged with an
 * `i18n-dynamic` comment so `npm run i18n:extract-js -- --strict`
 * can tell them apart from accidental non-literal calls.
 */
export function dynamicStrings(): string[] {
  return [
    // Block labels (BlockDefinition.label).
    __('Text'),
    __('Heading'),
    __('Image'),
    __('Avatar'),
    __('Divider'),
    __('Spacer'),
    __('Social'),
    __('Contact'),
    __('Button'),
    __('Disclaimer'),
    __('Container'),
    __('QR Code'),
    __('Banner'),
    __('vCard'),

    // Block descriptions (BlockDefinition.description) — library tooltips.
    __('Single block of formatted text.'),
    __('Larger text for emphasis.'),
    __('A single image with optional link.'),
    __('Round profile image.'),
    __('Horizontal line.'),
    __('Vertical empty space.'),
    __('Row of social media icons.'),
    __('Email / phone / web rows with icons.'),
    __('Call-to-action button.'),
    __('Small print at the bottom of the signature.'),
    __('1 or 2 column layout with embedded blocks.'),
    __('Scannable QR code, hosted as a PNG image.'),
    __('Promotional banner image with a click-through link.'),
    __('Link to a hosted contact card (.vcf).'),
  ];
}
