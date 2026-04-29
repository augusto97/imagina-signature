// Undo / Redo wired to GrapesJS' command stack.

import { JSX } from 'preact';
import type { Editor } from 'grapesjs';
import { Button } from '../../components/ui/Button';
import { __ } from '../../i18n/helpers';

interface Props {
  editor: Editor | null;
}

export function UndoRedo({ editor }: Props): JSX.Element | null {
  if (!editor) return null;
  return (
    <div className="is-inline-flex is-gap-1">
      <Button size="sm" variant="ghost" onClick={() => editor.UndoManager.undo()} title={__('Undo')}>
        ↶
      </Button>
      <Button size="sm" variant="ghost" onClick={() => editor.UndoManager.redo()} title={__('Redo')}>
        ↷
      </Button>
    </div>
  );
}
