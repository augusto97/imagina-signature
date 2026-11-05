import { __ } from '@/i18n/helpers';
import type { ContactType } from './normalize';

/** Example value per item type, shown as the value field's placeholder. */
export function valuePlaceholder(type: ContactType): string {
  switch (type) {
    case 'email':
      return 'name@example.com'; // i18n-ignore
    case 'phone':
    case 'whatsapp':
      return '+1 555 123 4567'; // i18n-ignore
    case 'mobile':
      return '+1 555 987 6543'; // i18n-ignore
    case 'website':
      return 'example.com'; // i18n-ignore
    case 'calendar':
      return 'calendly.com/your-name'; // i18n-ignore
    case 'address':
      return __('Street, city');
    default:
      return __('Any text');
  }
}
