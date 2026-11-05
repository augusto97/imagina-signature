// i18n-ignore-file — example URLs, not prose.

/** Example profile URL per network, shown as the URL field placeholder. */
const PLACEHOLDERS: Record<string, string> = {
  linkedin: 'https://linkedin.com/in/…',
  x: 'https://x.com/…',
  facebook: 'https://facebook.com/…',
  instagram: 'https://instagram.com/…',
  youtube: 'https://youtube.com/@…',
  tiktok: 'https://tiktok.com/@…',
  github: 'https://github.com/…',
  whatsapp: 'https://wa.me/15551234567',
  telegram: 'https://t.me/…',
  threads: 'https://threads.net/@…',
  bluesky: 'https://bsky.app/profile/…',
  mastodon: 'https://mastodon.social/@…',
  pinterest: 'https://pinterest.com/…',
  behance: 'https://behance.net/…',
  dribbble: 'https://dribbble.com/…',
  medium: 'https://medium.com/@…',
  discord: 'https://discord.gg/…',
  spotify: 'https://open.spotify.com/…',
  vimeo: 'https://vimeo.com/…',
  twitch: 'https://twitch.tv/…',
  reddit: 'https://reddit.com/user/…',
  snapchat: 'https://snapchat.com/add/…',
  calendly: 'https://calendly.com/…',
  website: 'https://example.com',
  email: 'name@example.com',
};

export function urlPlaceholder(network: string): string {
  return PLACEHOLDERS[network] ?? 'https://…';
}
