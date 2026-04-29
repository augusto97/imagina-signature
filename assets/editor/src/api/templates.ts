import { apiGet } from './client';
import type { TemplateRecord } from '@shared/types';

export const templatesApi = {
  list: (category?: string) =>
    apiGet<{ items: TemplateRecord[] }>(
      `/templates${category ? `?category=${encodeURIComponent(category)}` : ''}`,
    ),
  get: (id: number) => apiGet<TemplateRecord>(`/templates/${id}`),
};
