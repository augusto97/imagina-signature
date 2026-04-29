import { apiGet, apiPatch, apiPost, apiDelete } from '@shared/api-client';
import type { PlanRecord } from '@shared/types';

export const setupApi = {
  save: (data: { mode: 'single' | 'multi'; storage_driver: 'media_library' | 's3' }) =>
    apiPost<{ ok: boolean }>('/admin/setup', data),
};

export interface PlanInput {
  slug: string;
  name: string;
  description?: string;
  is_default?: boolean;
  is_active?: boolean;
  sort_order?: number;
  limits: PlanRecord['limits'];
}

export const plansApi = {
  list: (includeInactive = false) =>
    apiGet<{ items: PlanRecord[] }>(`/admin/plans${includeInactive ? '?include_inactive=1' : ''}`),
  get: (id: number) => apiGet<PlanRecord>(`/admin/plans/${id}`),
  create: (data: PlanInput) => apiPost<PlanRecord>('/admin/plans', data),
  update: (id: number, data: Partial<PlanInput>) => apiPatch<PlanRecord>(`/admin/plans/${id}`, data),
  delete: (id: number) => apiDelete<{ deleted: true }>(`/admin/plans/${id}`),
};

export interface AdminUserItem {
  id: number;
  display_name: string;
  email: string;
  plan: PlanRecord | null;
  usage: {
    user_id: number;
    signatures_count: number;
    storage_bytes: number;
    last_activity_at: string | null;
    updated_at: string;
  };
}

export const usersApi = {
  list: (params: { search?: string; page?: number; per_page?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') qs.set(key, String(value));
    });
    return apiGet<{ items: AdminUserItem[]; total: number }>(
      `/admin/users${qs.toString() ? `?${qs.toString()}` : ''}`,
    );
  },
  create: (data: { email: string; name: string; plan_id: number; send_email: boolean }) =>
    apiPost<{ user_id: number }>('/admin/users', data),
  changePlan: (id: number, planId: number) =>
    apiPatch<{ ok: true }>(`/admin/users/${id}/plan`, { plan_id: planId }),
  delete: (id: number) => apiDelete<{ ok: true }>(`/admin/users/${id}`),
};

export interface StorageConfig {
  endpoint?: string;
  region?: string;
  bucket?: string;
  access_key?: string;
  secret_key?: string;
  secret_key_set?: boolean;
  path_style?: boolean;
  public_base_url?: string;
}

export interface StorageResponse {
  driver: 'media_library' | 's3';
  config: StorageConfig;
}

export interface StoragePreset {
  name: string;
  endpoint_template: string;
  region?: string;
  region_options?: string[];
  extra_fields?: string[];
  path_style?: boolean;
  docs_url?: string;
}

export const storageApi = {
  get: () => apiGet<StorageResponse>('/admin/storage'),
  update: (data: { driver: string; config: Record<string, unknown> }) =>
    apiPatch<StorageResponse>('/admin/storage', data),
  test: () => apiPost<{ ok: boolean; message: string; details?: Record<string, unknown> }>('/admin/storage/test'),
  presets: () => apiGet<{ items: Record<string, StoragePreset> }>('/admin/storage/presets'),
};
