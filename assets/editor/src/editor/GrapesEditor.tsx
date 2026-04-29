// Preact wrapper around GrapesJS (CLAUDE.md §12.1 + ADR-0001).
//
// Mounts GrapesJS into a child container, owns its lifecycle, and bridges
// editor events back to the surrounding page via the props.

import { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Editor } from 'grapesjs';
import { initGrapesEditor } from './grapes-config';
import type { SignatureSchema } from '@shared/types';
import { loadSchemaIntoEditor } from '../compiler/json-to-grapes';
import { grapesToSchema } from '../compiler/grapes-to-json';
import { __ } from '../i18n/helpers';

interface Props {
  schema: SignatureSchema;
  onChange: (schema: SignatureSchema) => void;
  onReady?: (editor: Editor) => void;
}

export function GrapesEditor({ schema, onChange, onReady }: Props): JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const baseSchemaRef = useRef<SignatureSchema>(schema);

  // Init once.
  useEffect(() => {
    if (!canvasRef.current || !blocksRef.current || !layersRef.current || !propsRef.current) return;
    const editor = initGrapesEditor({
      container: canvasRef.current,
      blocksContainer: blocksRef.current,
      layersContainer: layersRef.current,
      propertiesContainer: propsRef.current,
    });
    editorRef.current = editor;
    loadSchemaIntoEditor(editor, baseSchemaRef.current);

    // Notify the parent on any change. The bridge is cheap; debounce upstream.
    const emit = () => {
      const next = grapesToSchema(editor, baseSchemaRef.current);
      onChange(next);
    };
    editor.on('component:add', emit);
    editor.on('component:remove', emit);
    editor.on('component:update', emit);
    editor.on('component:styleUpdate', emit);

    onReady?.(editor);

    return () => {
      editor.off('component:add', emit);
      editor.off('component:remove', emit);
      editor.off('component:update', emit);
      editor.off('component:styleUpdate', emit);
      editor.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-load if the externally-supplied schema id changes (e.g. user opens a
  // different signature). We compare by reference via baseSchemaRef.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (schema === baseSchemaRef.current) return;
    baseSchemaRef.current = schema;
    loadSchemaIntoEditor(editor, schema);
  }, [schema]);

  return (
    <div className="is-grapes-host is-flex is-h-full is-min-h-0 is-flex-1 is-bg-white">
      <aside className="is-w-56 is-border-r is-border-slate-200 is-overflow-y-auto" aria-label={__('Blocks')}>
        <header className="is-px-3 is-py-2 is-bg-slate-50 is-border-b is-border-slate-200 is-text-xs is-uppercase is-tracking-wider is-text-slate-500">
          {__('Blocks')}
        </header>
        <div ref={blocksRef} />
      </aside>
      <main className="is-flex-1 is-min-w-0 is-flex is-flex-col">
        <div ref={canvasRef} className="is-flex-1 is-min-h-0" />
      </main>
      <aside className="is-w-72 is-border-l is-border-slate-200 is-flex is-flex-col" aria-label={__('Properties')}>
        <section className="is-flex-1 is-min-h-0 is-overflow-y-auto">
          <header className="is-px-3 is-py-2 is-bg-slate-50 is-border-b is-border-slate-200 is-text-xs is-uppercase is-tracking-wider is-text-slate-500">
            {__('Properties')}
          </header>
          <div ref={propsRef} />
        </section>
        <section className="is-h-1/3 is-min-h-0 is-overflow-y-auto is-border-t is-border-slate-200">
          <header className="is-px-3 is-py-2 is-bg-slate-50 is-border-b is-border-slate-200 is-text-xs is-uppercase is-tracking-wider is-text-slate-500">
            {__('Layers')}
          </header>
          <div ref={layersRef} />
        </section>
      </aside>
    </div>
  );
}
