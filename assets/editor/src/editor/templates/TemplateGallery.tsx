import { memo, useMemo, useState, type FC, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import type { SignatureSchema } from '@/core/schema/signature';
import type { TemplateRow } from '@/stores/templateLibraryStore';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { templateCategoryLabel } from '@shared/templateCategories';
import { filterTemplates, isUsableTemplate, templateCategories } from './templateLibrary';
import { previewTemplateHtml } from './templatePreview';

/** White margin around a previewed signature, in CSS px of the email. */
const PREVIEW_PADDING = 16;

/** `html` with a white margin around the body (preview only). */
function framed(html: string): string {
  return html.replace(
    '</head>',
    `<style>body{padding:${PREVIEW_PADDING}px !important;background:#ffffff !important}</style></head>`,
  );
}

interface PreviewFrameProps {
  /** Compiled email HTML, or null when the template could not be compiled. */
  html: string | null;
  /** Canvas width of the signature, in px. */
  width: number;
  /** Width / height of the visible box, in CSS px (the height is the maximum with `autoHeight`). */
  boxWidth: number;
  boxHeight: number;
  /** Shrink the box to the signature's height (never below `minHeight`). Default: fixed box, content centred. */
  autoHeight?: boolean;
  minHeight?: number;
  title: string;
  className?: string;
}

/**
 * A compiled signature scaled down into a box: an `<iframe srcdoc>`
 * scaled with a CSS transform. The frame is sandboxed without scripts;
 * `allow-same-origin` only lets this component measure the signature's
 * height once loaded, to centre it in a fixed box (cards) or size the
 * box to it (`autoHeight`). Taller signatures are cropped at the bottom.
 */
export const TemplatePreviewFrame: FC<PreviewFrameProps> = ({
  html,
  width,
  boxWidth,
  boxHeight,
  autoHeight = false,
  minHeight = 120,
  title,
  className,
}) => {
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const srcDoc = useMemo(() => (html ? framed(html) : ''), [html]);

  if (!html) {
    return (
      <div
        aria-hidden
        className={cn('rounded bg-[var(--bg-panel-soft)]', className)}
        style={{ width: boxWidth, height: autoHeight ? minHeight : boxHeight }}
      />
    );
  }
  const outer = width + PREVIEW_PADDING * 2;
  const scale = Math.min(1, boxWidth / outer);
  const scaled = contentHeight === null ? null : Math.ceil(contentHeight * scale);
  const height = autoHeight
    ? Math.max(minHeight, Math.min(boxHeight, scaled ?? boxHeight))
    : boxHeight;
  const offset = !autoHeight && scaled !== null && scaled < height ? Math.floor((height - scaled) / 2) : 0;

  const measure = (frame: HTMLIFrameElement): void => {
    try {
      const table = frame.contentDocument?.querySelector('body > table');
      if (table) setContentHeight(table.getBoundingClientRect().height + PREVIEW_PADDING * 2);
    } catch {
      // Not readable — keep the top-aligned fixed box.
    }
  };

  return (
    <div
      className={cn('pointer-events-none relative overflow-hidden bg-white', className)}
      style={{ width: boxWidth, height }}
    >
      <iframe
        title={title}
        srcDoc={srcDoc}
        sandbox="allow-same-origin"
        tabIndex={-1}
        loading="lazy"
        onLoad={(e) => measure(e.currentTarget)}
        className="absolute left-0 border-0"
        style={{
          top: offset,
          width: outer,
          height: boxHeight / scale,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
};

/** Rendered size of a card thumbnail, in CSS px. */
export const THUMB_WIDTH = 272;
export const THUMB_HEIGHT = 136;

interface CardProps {
  template: TemplateRow;
  /** Signature variables to preview with (the user's own values win over the template's). */
  values?: Record<string, string>;
  onPick: (template: TemplateRow) => void;
}

/** One template: live thumbnail, name, category and description. */
export const TemplateCard: FC<CardProps> = memo(({ template, values, onPick }) => {
  const schema = template.json_content;
  const html = useMemo(
    () => (isUsableTemplate(schema) ? previewTemplateHtml(schema, values) : null),
    [schema, values],
  );
  return (
    <button
      type="button"
      className="group flex flex-col items-stretch gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] p-2.5 text-left transition-all hover:-translate-y-px hover:border-[var(--accent)] hover:shadow-[var(--shadow-md)] focus-visible:border-[var(--accent)]"
      onClick={() => onPick(template)}
    >
      <div
        aria-hidden
        className="flex justify-center overflow-hidden rounded-md border border-[var(--border-default)]"
      >
        <TemplatePreviewFrame
          html={html}
          width={(schema as SignatureSchema | undefined)?.canvas?.width || 600}
          boxWidth={THUMB_WIDTH}
          boxHeight={THUMB_HEIGHT}
          title={__('Preview of %s', template.name)}
        />
      </div>
      <div className="flex w-full items-start justify-between gap-2 px-0.5">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          {template.name}
        </span>
        {template.category && (
          <span className="shrink-0 rounded-full bg-[var(--bg-panel-soft)] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {templateCategoryLabel(template.category)}
          </span>
        )}
      </div>
      {template.description && (
        <span className="px-0.5 text-[11.5px] leading-snug text-[var(--text-muted)]">
          {template.description}
        </span>
      )}
    </button>
  );
});
TemplateCard.displayName = 'TemplateCard';

export const CategoryChip: FC<{
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'h-7 rounded-full border px-3 text-[11.5px] font-medium transition-colors',
      active
        ? 'border-transparent bg-[var(--accent)] text-white'
        : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
    )}
  >
    {children}
  </button>
);

interface BrowserProps {
  templates: TemplateRow[];
  values?: Record<string, string>;
  onPick: (template: TemplateRow) => void;
  /** Rendered before the template cards (e.g. a "Start blank" card). */
  leading?: ReactNode;
  /** Grid columns at the modal's width. */
  columns?: 2 | 3;
}

/**
 * Search field, translated category chips, result count and the card
 * grid. Search matches name, description and category (slug or label).
 */
export const TemplateBrowser: FC<BrowserProps> = ({
  templates,
  values,
  onPick,
  leading,
  columns = 2,
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const categories = useMemo(() => templateCategories(templates), [templates]);
  const filtered = useMemo(
    () => filterTemplates(templates, category, search),
    [templates, category, search],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-[220px] max-w-xs flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="search"
            placeholder={__('Search templates…')}
            aria-label={__('Search templates')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="!pl-9"
          />
        </div>
        <span className="text-[11.5px] text-[var(--text-muted)]" aria-live="polite">
          {filtered.length === templates.length
            ? __('%s templates', String(templates.length))
            : __('%1$s of %2$s templates', String(filtered.length), String(templates.length))}
        </span>
      </div>

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={__('Categories')}>
          <CategoryChip active={category === 'all'} onClick={() => setCategory('all')}>
            {__('All')}
          </CategoryChip>
          {categories.map((c) => (
            <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {templateCategoryLabel(c)}
            </CategoryChip>
          ))}
        </div>
      )}

      {filtered.length === 0 && !leading ? (
        <p className="rounded-md bg-[var(--bg-panel-soft)] p-4 text-center text-[12px] text-[var(--text-muted)]">
          {__('No templates match your filters.')}
        </p>
      ) : (
        <div
          className={cn(
            'grid grid-cols-1 gap-3',
            columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
          )}
        >
          {leading}
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} values={values} onPick={onPick} />
          ))}
        </div>
      )}
      {filtered.length === 0 && leading && (
        <p className="text-center text-[12px] text-[var(--text-muted)]">
          {__('No templates match your filters.')}
        </p>
      )}
    </div>
  );
};
