// Empty-state placeholder. Returns an HTMLElement so it works with the
// pre-Preact Sprint scaffolding.

export interface EmptyStateOptions {
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function createEmptyState(options: EmptyStateOptions): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('role', 'status');
  Object.assign(root.style, {
    padding: '32px',
    textAlign: 'center',
    border: '1px dashed #cbd5e1',
    borderRadius: '8px',
    background: '#f8fafc',
    color: '#475569',
  } satisfies Partial<CSSStyleDeclaration>);

  const title = document.createElement('h2');
  title.textContent = options.title;
  title.style.margin = '0 0 8px';
  title.style.fontSize = '18px';
  root.appendChild(title);

  if (options.description) {
    const p = document.createElement('p');
    p.textContent = options.description;
    p.style.margin = '0 0 16px';
    root.appendChild(p);
  }

  if (options.ctaLabel && options.onCta) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = options.ctaLabel;
    Object.assign(btn.style, {
      padding: '8px 16px',
      background: '#1d4ed8',
      color: '#ffffff',
      border: '0',
      borderRadius: '4px',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    btn.addEventListener('click', () => options.onCta?.());
    root.appendChild(btn);
  }

  return root;
}
