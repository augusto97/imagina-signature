import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';

export interface RowMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  /** A link (opens in this tab) … */
  href?: string;
  /** … or an action. */
  onSelect?: () => void;
  disabled?: boolean;
}

/**
 * The per-person "Actions" menu of the team table. Closes on Escape, on
 * a click outside and after choosing an item.
 */
export const RowMenu: FC<{ label: string; items: RowMenuItem[] }> = ({ label, items }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemClass =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={__('Actions')}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 min-w-[15rem] overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] py-1 shadow-[var(--shadow-lg)]"
        >
          {items.map((item) =>
            item.href && !item.disabled ? (
              <a key={item.key} role="menuitem" href={item.href} className={itemClass}>
                {item.icon}
                <span>{item.label}</span>
              </a>
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={cn(itemClass)}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
};
