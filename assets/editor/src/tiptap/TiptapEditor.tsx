import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, type FC } from 'react';
import { __ } from '@/i18n/helpers';

export type AllowedFormat = 'bold' | 'italic' | 'underline' | 'link';

interface Props {
  content: string;
  onChange: (html: string) => void;
  allowedFormats?: AllowedFormat[];
}

/**
 * Tiptap-backed rich text editor scoped to the email-safe whitelist
 * (CLAUDE.md §12.1).
 *
 * StarterKit's blocky nodes (heading, lists, blockquote, codeBlock,
 * code, horizontalRule) are disabled — only the `paragraph`,
 * `text`, `bold`, `italic`, plus the `Underline` and `Link`
 * extensions stay. Link URLs are validated to http(s)/mailto/tel
 * so a paste can't sneak in `javascript:` etc.
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
  allowedFormats = ['bold', 'italic', 'underline', 'link'],
}) => {
  // Memoised so the extension instances are stable across renders —
  // a fresh array each render made @tiptap/react call setOptions() on
  // every keystroke.
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener', target: '_blank' },
        validate: (url: string) => /^(https?:\/\/|mailto:|tel:)/i.test(url),
      }),
    ],
    [],
  );

  const lastSyncedRef = useRef(content);

  const editor = useEditor({
    extensions,
    content,
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      lastSyncedRef.current = html;
      onChange(html);
    },
  });

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

  return (
    <div className="rounded border border-[var(--border-default)]">
      <div className="flex items-center gap-1 border-b border-[var(--border-default)] bg-[var(--bg-hover)] px-1 py-1">
        {allowedFormats.includes('bold') && (
          <ToolbarButton
            label={__('Bold')}
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={14} />
          </ToolbarButton>
        )}
        {allowedFormats.includes('italic') && (
          <ToolbarButton
            label={__('Italic')}
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={14} />
          </ToolbarButton>
        )}
        {allowedFormats.includes('underline') && (
          <ToolbarButton
            label={__('Underline')}
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon size={14} />
          </ToolbarButton>
        )}
        {allowedFormats.includes('link') && (
          <ToolbarButton
            label={__('Link')}
            active={editor.isActive('link')}
            onClick={handleLinkClick}
          >
            <LinkIcon size={14} />
          </ToolbarButton>
        )}
      </div>
      <EditorContent
        editor={editor}
        className="prose-sm min-h-[80px] p-2 text-sm focus:outline-none"
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
    onClick={onClick}
    className={`rounded p-1 ${active ? 'bg-[var(--bg-selected)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel)]'}`}
  >
    {children}
  </button>
);
