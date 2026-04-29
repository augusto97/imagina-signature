import { apiGet } from './client';
import type { MeResponse } from '@shared/types';

export const meApi = {
  get: () => apiGet<MeResponse>('/me'),
};
