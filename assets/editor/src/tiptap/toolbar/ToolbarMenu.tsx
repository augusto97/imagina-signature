import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

interface Props {
  /** Accessible name / tooltip (translated). */
  label: string;
  /** Trigger content (icon, current value…). */
  trigger: ReactNode;
  active?: boolean;
  /** Panel width in px (kept narrow: the sidebar is 288px). */
  width?: number;
  /** Which trigger edge the panel lines up with (use 'end' near the right edge). */
  align?: 'start' | 'end';
  /** Panel contents; call `close()` after applying a choice. */
  children: (close: () => void) => ReactNode;
}

/**
 * Small dropdown used by the rich-text toolbar (colour, size, insert
 * field). Self-contained — no portal — so it scrolls with the sidebar.
 *
 * The trigger and every control inside the panel prevent the default
 * `mousedown`, so the editor keeps focus and its selection while the
 * user picks a value. Closes on Escape and on outside clicks.
 */
export const ToolbarMenu: FC<Props> = ({
  label,
  trigger,
  active,
  width = 208,
  align = 'start',
  children,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-6 items-center gap-0.5 rounded px-1',
          active || open
            ? 'bg-[var(--bg-selected)] text-[var(--accent)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel)]',
        )}
      >
        {trigger}
        <ChevronDown size={10} className="opacity-60" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          style={{ width }}
          className={cn(
            'absolute top-full z-30 mt-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] p-2 text-[11px] shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
          )}
          onMouseDown={(e) => {
            // Keep the editor selection — except for native inputs
            // (the custom colour picker) that need focus to work.
            if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};
