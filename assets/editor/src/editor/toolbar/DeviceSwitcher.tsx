// Toolbar device switcher (CLAUDE.md §12.1 deviceManager: Desktop / Mobile).

import { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Editor } from 'grapesjs';
import { Select } from '../../components/ui/Select';
import { __ } from '../../i18n/helpers';

interface Props {
  editor: Editor | null;
}

export function DeviceSwitcher({ editor }: Props): JSX.Element | null {
  const [device, setDevice] = useState('desktop');

  useEffect(() => {
    if (!editor) return;
    setDevice(String(editor.Devices.getSelected()?.id ?? 'desktop'));
    const listener = () => setDevice(String(editor.Devices.getSelected()?.id ?? 'desktop'));
    editor.on('change:device', listener);
    return () => {
      editor.off('change:device', listener);
    };
  }, [editor]);

  if (!editor) return null;

  const options = editor.Devices.getDevices().map((d) => ({
    value: String(d.id ?? ''),
    label: String(d.attributes?.name ?? d.id ?? ''),
  }));

  return (
    <div className="is-w-32">
      <Select
        value={device}
        onValueChange={(v) => {
          editor.setDevice(v);
          setDevice(v);
        }}
        options={options}
      />
    </div>
  );
}
