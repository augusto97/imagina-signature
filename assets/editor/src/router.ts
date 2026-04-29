// Tiny hash-based router. Lives at `#/path` so it stays inside
// /wp-admin/admin.php?page=imagina-signatures and doesn't need permalinks.

import { useEffect, useState } from 'preact/hooks';

export interface RouterLocation {
  path: string;
  query: URLSearchParams;
}

function parseHash(): RouterLocation {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, search = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(search) };
}

export function useRouter(): RouterLocation {
  const [loc, setLoc] = useState<RouterLocation>(parseHash);
  useEffect(() => {
    const onChange = () => setLoc(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return loc;
}

export function navigate(path: string, query: Record<string, string | number | undefined> = {}): void {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  window.location.hash = search ? `${path}?${search}` : path;
}

export function buildHref(path: string, query: Record<string, string | number | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `#${path}?${search}` : `#${path}`;
}
