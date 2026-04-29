import { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { templatesApi } from '../api/templates';
import { signaturesApi } from '../api/signatures';
import type { TemplateRecord } from '@shared/types';
import { Button } from '../components/ui/Button';
import { __ } from '../i18n/helpers';
import { navigate } from '../router';
import { pushToast } from '../components/ui/Toaster';

export function TemplatesPage(): JSX.Element {
  const [items, setItems] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingFrom, setCreatingFrom] = useState<number | null>(null);

  useEffect(() => {
    templatesApi
      .list()
      .then((res) => setItems(res.items))
      .catch(() => pushToast(__('Could not load templates.'), 'error'))
      .finally(() => setLoading(false));
  }, []);

  const useTemplate = async (template: TemplateRecord): Promise<void> => {
    setCreatingFrom(template.id);
    try {
      const created = await signaturesApi.create({
        name: template.name,
        json_content: template.json_content,
        template_id: template.id,
      });
      navigate('/editor', { id: created.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : __('Unknown error');
      pushToast(message, 'error');
    } finally {
      setCreatingFrom(null);
    }
  };

  return (
    <div className="is-max-w-6xl is-mx-auto is-px-4 is-py-6">
      <header className="is-flex is-items-start is-justify-between is-gap-4 is-mb-6">
        <div>
          <h1 className="is-text-2xl is-font-bold">{__('Templates')}</h1>
          <p className="is-mt-1 is-text-slate-600">
            {__('Pick a starting point. You can customize everything in the editor.')}
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/signatures')}>
          {__('Back to signatures')}
        </Button>
      </header>

      {loading ? (
        <div className="is-py-12 is-text-center is-text-slate-500">{__('Loading…')}</div>
      ) : items.length === 0 ? (
        <div className="is-py-12 is-text-center is-text-slate-500">
          {__('No templates available for your plan yet.')}
        </div>
      ) : (
        <div className="is-grid is-grid-cols-1 sm:is-grid-cols-2 lg:is-grid-cols-3 is-gap-4">
          {items.map((template) => (
            <Card
              key={template.id}
              template={template}
              onUse={() => useTemplate(template)}
              loading={creatingFrom === template.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  template: TemplateRecord;
  onUse: () => void;
  loading: boolean;
}

function Card({ template, onUse, loading }: CardProps): JSX.Element {
  return (
    <article className="is-bg-white is-rounded is-shadow-sm is-border is-border-slate-200 is-flex is-flex-col">
      <div className="is-aspect-[16/9] is-bg-slate-100 is-flex is-items-center is-justify-center is-text-slate-400">
        {template.preview_url ? (
          <img src={template.preview_url} alt={template.name} className="is-w-full is-h-full is-object-cover" />
        ) : (
          <span className="is-text-xs is-uppercase is-tracking-wider">{template.category}</span>
        )}
      </div>
      <div className="is-p-4 is-flex-1 is-flex is-flex-col">
        <h3 className="is-font-semibold is-text-slate-900">{template.name}</h3>
        {template.is_premium && (
          <span className="is-inline-block is-mt-1 is-px-2 is-py-0.5 is-bg-amber-100 is-text-amber-800 is-text-xs is-rounded is-self-start">
            {__('Premium')}
          </span>
        )}
        {template.description && (
          <p className="is-mt-2 is-text-sm is-text-slate-600 is-flex-1">{template.description}</p>
        )}
        <Button onClick={onUse} loading={loading} className="is-mt-4">
          {__('Use this template')}
        </Button>
      </div>
    </article>
  );
}
