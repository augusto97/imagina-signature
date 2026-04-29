// Editor page (CLAUDE.md §12 + ADR-0001).
//
// Owns load/save lifecycle and toolbar; delegates the canvas, blocks panel,
// layers panel, and properties panel to <GrapesEditor>.

import { JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Editor } from 'grapesjs';
import { signaturesApi } from '../api/signatures';
import type { SignatureSchema } from '@shared/types';
import { CANVAS_DEFAULTS, SCHEMA_VERSION } from '@shared/constants';
import { GrapesEditor } from '../editor/GrapesEditor';
import { VariablesPanel } from '../editor/panels/VariablesPanel';
import { DeviceSwitcher } from '../editor/toolbar/DeviceSwitcher';
import { UndoRedo } from '../editor/toolbar/UndoRedo';
import { PreviewToggle } from '../editor/toolbar/PreviewToggle';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { __ } from '../i18n/helpers';
import { navigate } from '../router';
import { pushToast } from '../components/ui/Toaster';
import { copyToClipboard } from '../utils/clipboard';
import { debounce } from '../utils/debounce';
import { compileSignature, type CompileResult } from '../compiler';

interface Props {
  signatureId: number;
}

function emptySchema(): SignatureSchema {
  const now = new Date().toISOString();
  return {
    schema_version: SCHEMA_VERSION,
    meta: { created_at: now, updated_at: now, editor_version: '1.1.0' },
    canvas: { ...CANVAS_DEFAULTS },
    layout: { type: 'table', columns: 1, gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 } },
    blocks: [],
    variables: { name: 'Jane Doe', role: 'Account Executive', company: 'Acme Inc.', email: 'jane@acme.com' },
  };
}

export function EditorPage({ signatureId }: Props): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(__('Untitled signature'));
  const [schema, setSchema] = useState<SignatureSchema | null>(null);
  const [savedId, setSavedId] = useState<number | null>(signatureId || null);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const compiledRef = useRef<CompileResult | null>(null);
  const dirtyRef = useRef(false);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (! signatureId) {
      setSchema(emptySchema());
      setSavedId(null);
      setLoading(false);
      return;
    }
    signaturesApi
      .get(signatureId)
      .then((record) => {
        if (cancelled) return;
        setName(record.name);
        setSchema(record.json_content);
        setSavedId(record.id);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : __('Could not load signature.');
        pushToast(message, 'error');
        navigate('/signatures');
      })
      .finally(() => {
        if (! cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signatureId]);

  // Compile preview asynchronously whenever the schema changes.
  useEffect(() => {
    if (! schema) return;
    let cancelled = false;
    compileSignature(schema)
      .then((result) => {
        if (cancelled) return;
        compiledRef.current = result;
      })
      .catch(() => {
        // Compilation failure is surfaced when the user tries to copy/export.
      });
    return () => {
      cancelled = true;
    };
  }, [schema]);

  const persist = useCallback(
    async (currentSchema: SignatureSchema, currentName: string): Promise<void> => {
      if (saving) return;
      setSaving(true);
      try {
        if (savedId) {
          await signaturesApi.update(savedId, {
            name: currentName,
            json_content: currentSchema,
            html_cache: compiledRef.current?.html ?? null,
          });
        } else {
          const created = await signaturesApi.create({ name: currentName, json_content: currentSchema });
          setSavedId(created.id);
          navigate('/editor', { id: created.id });
        }
        setLastSavedAt(new Date().toISOString());
        dirtyRef.current = false;
      } catch (error) {
        const message = error instanceof Error ? error.message : __('Save failed');
        pushToast(message, 'error');
      } finally {
        setSaving(false);
      }
    },
    [savedId, saving],
  );

  // Debounced autosave.
  const debouncedPersistRef = useRef<((s: SignatureSchema, n: string) => void) | null>(null);
  useEffect(() => {
    debouncedPersistRef.current = debounce<[SignatureSchema, string]>((s, n) => {
      void persist(s, n);
    }, 800);
  }, [persist]);

  const handleSchemaChange = useCallback((next: SignatureSchema) => {
    dirtyRef.current = true;
    setSchema(next);
    debouncedPersistRef.current?.(next, name);
  }, [name]);

  const handleVariablesChange = useCallback((variables: Record<string, string>) => {
    if (! schema) return;
    handleSchemaChange({ ...schema, variables });
  }, [schema, handleSchemaChange]);

  const onCopyHtml = async (): Promise<void> => {
    if (! schema) return;
    const result = compiledRef.current ?? (await compileSignature(schema));
    if (! result.html) {
      pushToast(__('Compilation failed.'), 'warning');
      return;
    }
    const ok = await copyToClipboard(result.html);
    pushToast(ok ? __('HTML copied to clipboard.') : __('Could not copy.'), ok ? 'success' : 'error');
  };

  const onExportHtml = async (): Promise<void> => {
    if (! schema) return;
    const result = compiledRef.current ?? (await compileSignature(schema));
    if (! result.html) {
      pushToast(__('Compilation failed.'), 'warning');
      return;
    }
    const blob = new Blob([result.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name || 'signature'}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const onSaveNow = (): void => {
    if (! schema) return;
    void persist(schema, name);
  };

  if (loading || ! schema) {
    return <div className="is-py-24 is-text-center is-text-slate-500">{__('Loading editor…')}</div>;
  }

  return (
    <div className="is-flex is-flex-col is-h-[calc(100vh-32px)]">
      <header className="is-flex is-items-center is-gap-3 is-px-4 is-py-2 is-border-b is-border-slate-200 is-bg-white">
        <Button size="sm" variant="ghost" onClick={() => navigate('/signatures')}>
          ← {__('Back')}
        </Button>
        <div className="is-w-64">
          <Input
            value={name}
            onInput={(event) => {
              const next = (event.target as HTMLInputElement).value;
              setName(next);
              dirtyRef.current = true;
              if (schema) debouncedPersistRef.current?.(schema, next);
            }}
          />
        </div>
        <span className="is-text-xs is-text-slate-500">
          {saving
            ? __('Saving…')
            : dirtyRef.current
              ? __('Unsaved')
              : lastSavedAt
                ? __('Saved')
                : ''}
        </span>
        <DeviceSwitcher editor={editor} />
        <UndoRedo editor={editor} />
        <PreviewToggle editor={editor} />
        <span className="is-flex-1" />
        <Button size="sm" variant="secondary" onClick={onCopyHtml}>
          {__('Copy HTML')}
        </Button>
        <Button size="sm" variant="secondary" onClick={onExportHtml}>
          {__('Export .html')}
        </Button>
        <Button size="sm" onClick={onSaveNow} loading={saving}>
          {__('Save')}
        </Button>
      </header>

      <div className="is-flex is-flex-1 is-min-h-0">
        <GrapesEditor schema={schema} onChange={handleSchemaChange} onReady={setEditor} />
        <aside className="is-w-64 is-bg-white is-border-l is-border-slate-200 is-overflow-y-auto" aria-label={__('Variables')}>
          <VariablesPanel variables={schema.variables} onChange={handleVariablesChange} />
        </aside>
      </div>
    </div>
  );
}
