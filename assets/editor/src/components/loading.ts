// Lightweight loading + skeleton elements.

export function createSpinner(label = 'Loading…'): HTMLElement {
  const wrap = document.createElement('div');
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');
  Object.assign(wrap.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    color: '#475569',
  } satisfies Partial<CSSStyleDeclaration>);

  const dot = document.createElement('span');
  Object.assign(dot.style, {
    width: '12px',
    height: '12px',
    border: '2px solid #cbd5e1',
    borderTopColor: '#1d4ed8',
    borderRadius: '50%',
    animation: 'is-spin 0.8s linear infinite',
  } satisfies Partial<CSSStyleDeclaration>);
  wrap.appendChild(dot);

  const text = document.createElement('span');
  text.textContent = label;
  wrap.appendChild(text);

  ensureKeyframes();
  return wrap;
}

let keyframesInjected = false;
function ensureKeyframes(): void {
  if (keyframesInjected) return;
  const style = document.createElement('style');
  style.textContent = '@keyframes is-spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
  keyframesInjected = true;
}

export function createSkeleton(width: number, height: number): HTMLElement {
  const div = document.createElement('div');
  Object.assign(div.style, {
    width: width + 'px',
    height: height + 'px',
    background:
      'linear-gradient(90deg, #e5e7eb 0%, #f3f4f6 50%, #e5e7eb 100%)',
    backgroundSize: '200% 100%',
    animation: 'is-skel 1.4s linear infinite',
    borderRadius: '4px',
  } satisfies Partial<CSSStyleDeclaration>);
  if (!keyframesInjected) {
    ensureKeyframes();
  }
  const style = document.createElement('style');
  style.textContent = '@keyframes is-skel { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }';
  document.head.appendChild(style);
  return div;
}
