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
  // Tracks the schema that originated from THIS editor instance — when the
  // parent re-passes that exact reference, we know it didn't change and we
  // skip the reload that would otherwise re-emit `component:add` events
  // and create an infinite loop.
  const lastEmittedRef = useRef<SignatureSchema | null>(null);
  // Suppresses event emission during programmatic loads (`setComponents`).
  const loadingRef = useRef(false);
  // Holds the latest `onChange` so we always call the parent's current
  // closure, not the one captured at first mount.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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

    loadingRef.current = true;
    loadSchemaIntoEditor(editor, schema);
    loadingRef.current = false;

    // Coalesce many GrapesJS events fired in the same tick (drag&drop fires
    // dozens of `component:update` for trait edits) into a single emit.
    let emitTimer: number | null = null;
    const scheduleEmit = (): void => {
      if (loadingRef.current) return;
      if (emitTimer !== null) return;
      emitTimer = window.setTimeout(() => {
        emitTimer = null;
        const ed = editorRef.current;
        if (!ed) return;
        const next = grapesToSchema(ed, lastEmittedRef.current ?? undefined);
        lastEmittedRef.current = next;
        onChangeRef.current(next);
      }, 60);
    };

    editor.on('component:add', scheduleEmit);
    editor.on('component:remove', scheduleEmit);
    editor.on('component:update', scheduleEmit);

    onReady?.(editor);

    return () => {
      if (emitTimer !== null) window.clearTimeout(emitTimer);
      editor.off('component:add', scheduleEmit);
      editor.off('component:remove', scheduleEmit);
      editor.off('component:update', scheduleEmit);
      editor.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-load only when the schema *didn't* originate from this editor — i.e.
  // the user opened a different signature, or the parent transformed it
  // outside the change cycle.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (schema === lastEmittedRef.current) return;
    loadingRef.current = true;
    loadSchemaIntoEditor(editor, schema);
    loadingRef.current = false;
    lastEmittedRef.current = schema;
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
