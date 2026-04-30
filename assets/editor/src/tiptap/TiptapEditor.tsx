import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon } from 'lucide-react';
import type { FC } from 'react';
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
 */
export const TiptapEditor: FC<Props> = ({
  content,
  onChange,
  allowedFormats = ['bold', 'italic', 'underline', 'link'],
}) => {
  const editor = useEditor({
    extensions: [
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
    content,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
  });

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
