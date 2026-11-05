import { useEffect } from 'react';
import { create } from 'zustand';
import { apiCall } from '@/bridge/apiClient';
import type { SignatureSchema } from '@/core/schema/signature';

/** A row of `GET /templates` (name / description already localised by PHP). */
export interface TemplateRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  preview_url: string | null;
  json_content: SignatureSchema;
}

interface TemplateLibraryState {
  /** null until loaded. */
  templates: TemplateRow[] | null;
  error: string | null;
  loading: boolean;
  /** Fetches the library unless it is loaded or loading. */
  load: () => void;
  /** Forgets the library so the next `load()` refetches (after "Save as template"). */
  invalidate: () => void;
}

/**
 * The template library, loaded once (`GET /templates?per_page=100`) and
 * shared by the template picker and the onboarding.
 */
export const useTemplateLibraryStore = create<TemplateLibraryState>((set, get) => ({
  templates: null,
  error: null,
  loading: false,

  load: () => {
    if (get().loading || get().templates !== null) return;
    set({ loading: true, error: null });
    apiCall<TemplateRow[]>('/templates?per_page=100')
      .then((rows) => set({ templates: Array.isArray(rows) ? rows : [], loading: false }))
      .catch((err: Error) => set({ error: err.message, loading: false }));
  },

  invalidate: () => set({ templates: null, error: null }),
}));

/** The library, loaded as soon as `enabled` is true. */
export function useTemplates(enabled: boolean): {
  templates: TemplateRow[] | null;
  error: string | null;
} {
  const templates = useTemplateLibraryStore((s) => s.templates);
  const error = useTemplateLibraryStore((s) => s.error);
  const load = useTemplateLibraryStore((s) => s.load);

  useEffect(() => {
    if (enabled && templates === null && error === null) load();
  }, [enabled, templates, error, load]);

  return { templates, error };
}
