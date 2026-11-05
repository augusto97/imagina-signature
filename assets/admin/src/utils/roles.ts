import { __ } from '@admin/i18n';

/**
 * Standard WordPress role slugs surfaced in role pickers. Custom roles
 * aren't enumerated yet (would need a `/admin/roles` endpoint); the
 * server stores whatever slug we POST so a custom role can still be
 * wired manually via the JSON API.
 */
export const WP_ROLES: Array<{ slug: string; label: () => string }> = [
  { slug: 'administrator', label: () => __('Administrator') },
  { slug: 'editor', label: () => __('Editor') },
  { slug: 'author', label: () => __('Author') },
  { slug: 'contributor', label: () => __('Contributor') },
  { slug: 'subscriber', label: () => __('Subscriber') },
];

/** Translated name of a standard role; custom role slugs are shown as-is. */
export function roleLabel(slug: string): string {
  const role = WP_ROLES.find((r) => r.slug === slug);
  return role ? role.label() : slug;
}
