import { __ } from './i18n';

/**
 * Display label of a template category.
 *
 * Categories are stored as free-form slugs (`corporate`, `sales`…) and
 * double as filter keys, so they are never translated in the data —
 * only here, at display time. The seeded categories (see
 * `src/Setup/DefaultTemplatesSeeder.php`) and the `general` default get
 * a translated label; anything an admin typed is shown as-is.
 */
export function templateCategoryLabel(category: string): string {
  switch (category.trim().toLowerCase()) {
    case 'general':
      return __('General');
    case 'minimal':
      return __('Minimal');
    case 'corporate':
      return __('Corporate');
    case 'sales':
      return __('Sales');
    case 'professional':
      return __('Professional');
    case 'creative':
      return __('Creative');
    case 'multi-column':
      return __('Multi-column');
    default:
      return category;
  }
}
