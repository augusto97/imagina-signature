// Tiny toast helper. Renders into a body-level container — no Preact
// component required so `assets/admin` can use it without React.

export type ToastType = 'success' | 'info' | 'warning' | 'error';

interface ToastOptions {
  duration?: number;
}

const CONTAINER_ID = 'is-toast-container';

function ensureContainer(): HTMLElement {
  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    Object.assign(host.style, {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      zIndex: '9999',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(host);
  }
  return host;
}

const colors: Record<ToastType, { bg: string; fg: string }> = {
  success: { bg: '#15803d', fg: '#ffffff' },
  info: { bg: '#1d4ed8', fg: '#ffffff' },
  warning: { bg: '#b45309', fg: '#ffffff' },
  error: { bg: '#b91c1c', fg: '#ffffff' },
};

export function toast(message: string, type: ToastType = 'info', options: ToastOptions = {}): void {
  const host = ensureContainer();
  const node = document.createElement('div');
  node.setAttribute('role', 'status');
  node.textContent = message;
  Object.assign(node.style, {
    background: colors[type].bg,
    color: colors[type].fg,
    padding: '10px 14px',
    borderRadius: '4px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
    fontSize: '13px',
    minWidth: '180px',
  } satisfies Partial<CSSStyleDeclaration>);
  host.appendChild(node);
  const duration = options.duration ?? 4000;
  window.setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity 200ms';
    window.setTimeout(() => node.remove(), 200);
  }, duration);
}
