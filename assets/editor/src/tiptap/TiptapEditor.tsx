import { useEditor, EditorContent, type AnyExtension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, type FC } from 'react';
import { __ } from '@/i18n/helpers';
import { FontSize } from './extensions/FontSize';
import { SingleParagraphDocument } from './extensions/SingleParagraphDocument';
import { VariableChips } from './extensions/VariableChips';
import { ColorMenu } from './toolbar/ColorMenu';
import { FontSizeMenu } from './toolbar/FontSizeMenu';
import { InsertFieldMenu } from './toolbar/InsertFieldMenu';

export type AllowedFormat = 'bold' | 'italic' | 'underline' | 'link' | 'color' | 'fontSize';

const ALL_FORMATS: AllowedFormat[] = ['bold', 'italic', 'underline', 'link', 'color', 'fontSize'];

interface Props {
  content: string;
  onChange: (html: string) => void;
  /** Formatting offered in the toolbar (and accepted by the schema). Default: all. */
  allowedFormats?: AllowedFormat[];
  /** Show the "Insert field" menu ({{variable}} tokens). Default true. */
  allowVariables?: boolean;
  /** Restrict the document to a single paragraph (headings). */
  singleParagraph?: boolean;
  /** Minimum height of the editable area in px. Default 80. */
  minHeight?: number;
}

/**
 * Tiptap-backed rich text editor scoped to the email-safe whitelist
 * (CLAUDE.md §12.1).
 *
 * StarterKit's blocky nodes (heading, lists, blockquote, codeBlock,
 * code, horizontalRule) and strike are disabled — only `paragraph`,
 * `text`, `hardBreak` and the allowed marks stay: bold, italic,
 * underline, link, and the `textStyle` mark carrying colour
 * (`@tiptap/extension-color`) and font size (`FontSize`). Link URLs are
 * validated to http(s)/mailto/tel so a paste can't sneak in
 * `javascript:` etc. A format that isn't allowed is left out of the
 * SCHEMA (not just the toolbar), so pasting can't introduce it either.
 *
 * `{{variable}}` tokens are shown as chips by a decoration plugin; the
 * stored HTML keeps them as plain text.
 *
 * The companion HtmlSanitizer on the server enforces the same
 * whitelist; a tampered request body can't slip arbitrary HTML
 * past validation.
 *
 * Controlled-ish: Tiptap only reads `content` when it creates the
 * editor, so an effect pushes later prop changes (undo / redo,
 * template apply, paste) into the document with `setContent`. The
 * sync never emits an update (no onChange → store → prop loop), is
 * kept out of Tiptap's own undo history, and restores the caret when
 * the editor has focus. `lastSyncedRef` remembers the HTML the editor
 * and the prop last agreed on, so a non-normalised prop value (e.g.
 * `Hello` vs Tiptap's `<p>Hello</p>`) doesn't re-sync on every
 * render.
 *
 * Callers should still key the component by the owning block id so
 * switching blocks mounts a fresh editor (see RightSidebar).
 */
export const TiptapEditor: FC<Props> = ({
  content,
  onChange,
  allowedFormats = ALL_FORMATS,
  allowVariables = true,
  singleParagraph = false,
  minHeight = 80,
}) => {
  const formatsKey = allowedFormats.join(',');
  const has = (format: AllowedFormat) => allowedFormats.includes(format);

  // Memoised so the extension instances are stable across renders —
  // a fresh array each render made @tiptap/react call setOptions() on
  // every keystroke.
  const extensions = useMemo(() => {
    const formats = new Set(formatsKey.split(','));
    const list: AnyExtension[] = [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        ...(singleParagraph ? { document: false as const } : {}),
        ...(formats.has('bold') ? {} : { bold: false as const }),
        ...(formats.has('italic') ? {} : { italic: false as const }),
      }),
      VariableChips,
    ];
    if (singleParagraph) list.push(SingleParagraphDocument);
    if (formats.has('underline')) list.push(Underline);
    if (formats.has('link')) {
      list.push(
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { rel: 'noopener', target: '_blank' },
          validate: (url: string) => /^(https?:\/\/|mailto:|tel:)/i.test(url),
        }),
      );
    }
    if (formats.has('color') || formats.has('fontSize')) list.push(TextStyle);
    if (formats.has('color')) list.push(Color);
    if (formats.has('fontSize')) list.push(FontSize);
    return list;
  }, [formatsKey, singleParagraph]);

  const lastSyncedRef = useRef(content);

  const editor = useEditor(
    {
      extensions,
      content,
      onUpdate: ({ editor: e }) => {
        const html = e.getHTML();
        lastSyncedRef.current = html;
        onChange(html);
      },
    },
    [extensions],
  );

  // Push external content changes into the editor.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (content === lastSyncedRef.current) return;
    if (content === editor.getHTML()) {
      lastSyncedRef.current = content;
      return;
    }

    const { from, to } = editor.state.selection;
    const focused = editor.isFocused;
    let chain = editor
      .chain()
      .command(({ tr }) => {
        // External syncs are not user typing — keep them out of
        // Tiptap's own (in-editor) undo stack.
        tr.setMeta('addToHistory', false);
        return true;
      })
      .setContent(content, false);
    if (focused) {
      chain = chain.setTextSelection({ from, to });
    }
    chain.run();
    lastSyncedRef.current = content;
  }, [editor, content]);

  if (!editor) return null;

  const handleLinkClick = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt(__('Link URL (https://, mailto:, or tel:)'), previous ?? '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const showMarks = has('bold') || has('italic') || has('underline') || has('link');
  const showStyle = has('color') || has('fontSize');

  return (
    <div className="rounded border border-[var(--border-default)]">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border-default)] bg-[var(--bg-hover)] px-1 py-1">
        {has('bold') && (
          <ToolbarButton
            label={__('Bold')}
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={14} />
          </ToolbarButton>
        )}
        {has('italic') && (
          <ToolbarButton
            label={__('Italic')}
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={14} />
          </ToolbarButton>
        )}
        {has('underline') && (
          <ToolbarButton
            label={__('Underline')}
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon size={14} />
          </ToolbarButton>
        )}
        {has('link') && (
          <ToolbarButton
            label={__('Link')}
            active={editor.isActive('link')}
            onClick={handleLinkClick}
          >
            <LinkIcon size={14} />
          </ToolbarButton>
        )}
        {showMarks && showStyle && <Divider />}
        {has('color') && <ColorMenu editor={editor} />}
        {has('fontSize') && <FontSizeMenu editor={editor} />}
        {allowVariables && (
          <>
            <span className="flex-1" />
            <InsertFieldMenu editor={editor} />
          </>
        )}
      </div>
      <EditorContent
        editor={editor}
        style={{ minHeight }}
        className="prose-sm p-2 text-sm focus:outline-none"
      />
    </div>
  );
};

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const ToolbarButton: FC<ToolbarButtonProps> = ({ label, active, onClick, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className={`rounded p-1 ${active ? 'bg-[var(--bg-selected)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel)]'}`}
  >
    {children}
  </button>
);

const Divider: FC = () => (
  <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-[var(--border-strong)]" />
);
