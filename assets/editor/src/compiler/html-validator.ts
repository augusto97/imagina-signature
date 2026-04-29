// Post-compilation lint that surfaces email-client gotchas to the user.

import { MAX_HTML_SIZE_BYTES } from '@shared/constants';
import { __ } from '../i18n/helpers';

export function validateEmailHtml(html: string): string[] {
  const warnings: string[] = [];

  const size = new Blob([html]).size;
  if (size > MAX_HTML_SIZE_BYTES) {
    warnings.push(__('HTML exceeds 102 KB; Gmail will clip the message.'));
  }

  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  imgs.forEach((tag) => {
    if (!/\salt\s*=/.test(tag)) {
      warnings.push(__('Image is missing the alt attribute.'));
    }
    if (!/\swidth\s*=/.test(tag)) {
      warnings.push(__('Image is missing an explicit width.'));
    }
  });

  const links = html.match(/<a\b[^>]*>/gi) ?? [];
  links.forEach((tag) => {
    if (!/\shref\s*=/.test(tag)) {
      warnings.push(__('Link is missing href.'));
    }
  });

  return warnings;
}
