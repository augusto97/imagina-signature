import { useState, type FC, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Collapsible section for the property panel. Header is the section
 * label + a chevron; clicking toggles the body. Defaults to open.
 *
 * The visual hierarchy mirrors the Framer / Webflow inspector
 * patterns — uppercase tracked label, light divider above, compact
 * body padding.
 */
export const PropertySection: FC<Props> = ({ title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState( defaultOpen );

  return (
    <section className="border-b border-[var(--border-subtle)] last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-panel-soft)]"
        onClick={() => setOpen(!open)}
      >
        <span className="is-section-label">{title}</span>
        {open ? (
          <ChevronDown size={12} className="text-[var(--text-muted)]" />
        ) : (
          <ChevronRight size={12} className="text-[var(--text-muted)]" />
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
};
