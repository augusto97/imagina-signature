import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { SignatureRecord, SignatureSchema } from '@shared/types';

export interface SignatureListResponse {
  items: SignatureRecord[];
  total: number;
}

export const signaturesApi = {
  list: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      qs.set(key, String(value));
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiGet<SignatureListResponse>(`/signatures${suffix}`);
  },
  get: (id: number) => apiGet<SignatureRecord>(`/signatures/${id}`),
  create: (data: { name: string; json_content: SignatureSchema; template_id?: number }) =>
    apiPost<SignatureRecord>('/signatures', data),
  update: (
    id: number,
    data: Partial<{ name: string; json_content: SignatureSchema; status: string; html_cache: string | null; preview_url: string | null }>,
  ) => apiPatch<SignatureRecord>(`/signatures/${id}`, data),
  delete: (id: number) => apiDelete<{ deleted: true }>(`/signatures/${id}`),
  duplicate: (id: number) => apiPost<SignatureRecord>(`/signatures/${id}/duplicate`),
};
