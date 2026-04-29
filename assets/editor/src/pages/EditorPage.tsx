import { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signaturesApi } from '../api/signatures';
import type { Block, SignatureSchema } from '@shared/types';
import { emptySchema } from '../schema/signature';
import { BLOCK_DESCRIPTORS } from '../editor/blocks';
import { BlocksPanel } from '../editor/BlocksPanel';
import { LayersPanel } from '../editor/LayersPanel';
import { CanvasPanel } from '../editor/CanvasPanel';
import { PropertiesPanel } from '../editor/PropertiesPanel';
import { Preview } from '../editor/Preview';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { __ } from '../i18n/helpers';
import { navigate } from '../router';
import { pushToast } from '../components/ui/Toaster';
import { useEditorStore } from '../stores/editorStore';
import { copyToClipboard } from '../utils/clipboard';
import { debounce } from '../utils/debounce';
import type { CompileResult } from '../compiler';

interface Props {
  signatureId: number;
}

export function EditorPage({ signatureId }: Props): JSX.Element {
  const editor = useEditorStore();
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const compiledRef = useRef<CompileResult | null>(null);

  // Load signature.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (!signatureId || signatureId === 0) {
      const schema = emptySchema();
      editor.setSignature(null, __('Untitled signature'), schema, 'draft');
      setLoading(false);
      return;
    }
    signaturesApi
      .get(signatureId)
      .then((record) => {
        if (cancelled) return;
        editor.setSignature(record.id, record.name, record.json_content, record.status);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : __('Could not load signature.');
        pushToast(message, 'error');
        navigate('/signatures');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureId]);

  const schema = editor.schema;
  const selectedBlock = useMemo(
    () => (schema && selectedId ? schema.blocks.find((block) => block.id === selectedId) ?? null : null),
    [schema, selectedId],
  );

  const updateSchema = useCallback(
    (next: SignatureSchema) => {
      editor.setSchema(next);
    },
    [editor],
  );

  // Autosave (debounced).
  const persistRef = useRef<((schema: SignatureSchema, name: string) => void) | null>(null);
  useEffect(() => {
    persistRef.current = debounce<[SignatureSchema, string]>((nextSchema, nextName) => {
      void save(nextSchema, nextName);
    }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editor.isDirty || !schema) return;
    persistRef.current?.(schema, editor.name);
  }, [editor.isDirty, editor.name, schema]);

  const save = async (currentSchema: SignatureSchema, currentName: string): Promise<void> => {
    if (!currentSchema) return;
    editor.markSaving(true);
    try {
      if (editor.signatureId) {
        await signaturesApi.update(editor.signatureId, {
          name: currentName,
          json_content: currentSchema,
          html_cache: compiledRef.current?.html ?? null,
        });
      } else {
        const created = await signaturesApi.create({
          name: currentName,
          json_content: currentSchema,
        });
        editor.setSignature(created.id, created.name, created.json_content, created.status);
        navigate('/editor', { id: created.id });
      }
      editor.markSaved();
    } catch (error) {
      editor.markSaving(false);
      const message = error instanceof Error ? error.message : __('Save failed');
      pushToast(message, 'error');
    }
  };

  const addBlock = (type: string): void => {
    if (!schema) return;
    const descriptor = BLOCK_DESCRIPTORS.find((b) => b.type === type);
    if (!descriptor) return;
    const block = descriptor.factory();
    const next: SignatureSchema = { ...schema, blocks: [...schema.blocks, block] };
    updateSchema(next);
    setSelectedId(block.id);
  };

  const updateBlock = (block: Block): void => {
    if (!schema) return;
    const next: SignatureSchema = {
      ...schema,
      blocks: schema.blocks.map((b) => (b.id === block.id ? block : b)),
    };
    updateSchema(next);
  };

  const removeBlock = (id: string): void => {
    if (!schema) return;
    const next: SignatureSchema = {
      ...schema,
      blocks: schema.blocks.filter((b) => b.id !== id),
    };
    updateSchema(next);
    setSelectedId(null);
  };

  const moveBlock = (id: string, direction: -1 | 1): void => {
    if (!schema) return;
    const blocks = schema.blocks.slice();
    const index = blocks.findIndex((b) => b.id === id);
    const newIndex = index + direction;
    if (index < 0 || newIndex < 0 || newIndex >= blocks.length) return;
    const [block] = blocks.splice(index, 1);
    blocks.splice(newIndex, 0, block);
    updateSchema({ ...schema, blocks });
  };

  const toggleVisible = (id: string): void => {
    if (!schema) return;
    const next: SignatureSchema = {
      ...schema,
      blocks: schema.blocks.map((b) => (b.id === id ? { ...b, visible: b.visible === false } : b)),
    };
    updateSchema(next);
  };

  const onCopyHtml = async (): Promise<void> => {
    const compiled = compiledRef.current;
    if (!compiled || !compiled.html) {
      pushToast(__('Preview not ready yet.'), 'warning');
      return;
    }
    const ok = await copyToClipboard(compiled.html);
    pushToast(ok ? __('HTML copied to clipboard.') : __('Could not copy.'), ok ? 'success' : 'error');
  };

  const onExportHtml = (): void => {
    const compiled = compiledRef.current;
    if (!compiled || !compiled.html) {
      pushToast(__('Preview not ready yet.'), 'warning');
      return;
    }
    const blob = new Blob([compiled.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editor.name || 'signature'}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onSaveNow = async (): Promise<void> => {
    if (!schema) return;
    await save(schema, editor.name);
  };

  if (loading || !schema) {
    return (
      <div className="is-py-24 is-text-center is-text-slate-500">{__('Loading editor…')}</div>
    );
  }

  return (
    <div className="is-flex is-flex-col is-h-[calc(100vh-32px)]">
      <header className="is-flex is-items-center is-gap-3 is-px-4 is-py-2 is-border-b is-border-slate-200 is-bg-white">
        <Button size="sm" variant="ghost" onClick={() => navigate('/signatures')}>
          ← {__('Back')}
        </Button>
        <Input
          className="is-min-w-[240px]"
          value={editor.name}
          onInput={(event) => editor.setName((event.target as HTMLInputElement).value)}
        />
        <span className="is-text-xs is-text-slate-500">
          {editor.isSaving ? __('Saving…') : editor.isDirty ? __('Unsaved') : editor.lastSavedAt ? __('Saved') : ''}
        </span>
        <span className="is-flex-1" />
        <Button size="sm" variant="secondary" onClick={onCopyHtml}>
          {__('Copy HTML')}
        </Button>
        <Button size="sm" variant="secondary" onClick={onExportHtml}>
          {__('Export .html')}
        </Button>
        <Button size="sm" onClick={onSaveNow} loading={editor.isSaving}>
          {__('Save')}
        </Button>
      </header>

      <div className="is-flex is-flex-1 is-min-h-0">
        <div className="is-flex is-flex-col is-w-56">
          <BlocksPanel onAdd={addBlock} />
        </div>
        <div className="is-flex is-flex-col is-w-64 is-bg-white is-border-r is-border-slate-200 is-overflow-y-auto">
          <CanvasPanel canvas={schema.canvas} onChange={(canvas) => updateSchema({ ...schema, canvas })} />
          <LayersPanel
            blocks={schema.blocks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={moveBlock}
            onToggleVisible={toggleVisible}
          />
        </div>
        <Preview
          schema={schema}
          onCompiled={(result) => {
            compiledRef.current = result;
          }}
        />
        {selectedBlock && (
          <PropertiesPanel
            block={selectedBlock}
            onChange={updateBlock}
            onDelete={() => removeBlock(selectedBlock.id)}
          />
        )}
      </div>
    </div>
  );
}
