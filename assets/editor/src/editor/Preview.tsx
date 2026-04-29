import { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { SignatureSchema } from '@shared/types';
import { compileSignature, type CompileResult } from '../compiler';
import { __ } from '../i18n/helpers';
import { EMULATORS, findEmulator, type EmulatorId } from '../preview/emulators';
import { Select } from '../components/ui/Select';

interface Props {
  schema: SignatureSchema;
  onCompiled?: (result: CompileResult) => void;
}

export function Preview({ schema, onCompiled }: Props): JSX.Element {
  const [emulator, setEmulator] = useState<EmulatorId>('gmail');
  const [result, setResult] = useState<CompileResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    compileSignature(schema)
      .then((compiled) => {
        if (cancelled) return;
        setResult(compiled);
        onCompiled?.(compiled);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  const descriptor = findEmulator(emulator);
  const html = result && descriptor ? descriptor.render(result.html, { darkMode: false }) : '';

  return (
    <section className="is-flex is-flex-col is-bg-slate-100 is-flex-1 is-min-w-0">
      <header className="is-px-4 is-py-2 is-border-b is-border-slate-200 is-bg-white is-flex is-items-center is-gap-3">
        <div className="is-w-40">
          <Select
            value={emulator}
            onValueChange={(value) => setEmulator(value as EmulatorId)}
            options={EMULATORS.map((emu) => ({ value: emu.id, label: emu.label }))}
          />
        </div>
        {result && (
          <div className="is-text-xs is-text-slate-500 is-flex is-gap-3">
            <span>
              {(result.size / 1024).toFixed(1)} {__('KB')}
            </span>
            {result.warnings.length > 0 && (
              <span className="is-text-amber-700" title={result.warnings.join('\n')}>
                ⚠ {result.warnings.length} {__('warnings')}
              </span>
            )}
          </div>
        )}
      </header>
      <div className="is-flex-1 is-overflow-auto is-flex is-justify-center is-py-4">
        {error ? (
          <div className="is-px-4 is-py-3 is-bg-red-50 is-border is-border-red-200 is-rounded is-text-red-700">
            {__('Preview failed: ')}
            {error}
          </div>
        ) : !result ? (
          <div className="is-text-slate-500 is-py-12">{__('Compiling…')}</div>
        ) : (
          <iframe
            title={__('Email preview')}
            srcDoc={html}
            sandbox=""
            className="is-bg-white is-shadow-md is-rounded"
            style={{ width: descriptor?.width ?? 640, height: 720, border: 0 }}
          />
        )}
      </div>
    </section>
  );
}
