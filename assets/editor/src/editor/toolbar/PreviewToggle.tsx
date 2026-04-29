// Preview toggle: hides the editor chrome and shows the canvas only.

import { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Editor } from 'grapesjs';
import { Button } from '../../components/ui/Button';
import { __ } from '../../i18n/helpers';

interface Props {
  editor: Editor | null;
}

export function PreviewToggle({ editor }: Props): JSX.Element | null {
  const [active, setActive] = useState(false);
  if (!editor) return null;

  const toggle = () => {
    if (active) {
      editor.stopCommand('preview');
      setActive(false);
    } else {
      editor.runCommand('preview');
      setActive(true);
    }
  };

  return (
    <Button size="sm" variant="secondary" onClick={toggle}>
      {active ? __('Edit') : __('Preview')}
    </Button>
  );
}
