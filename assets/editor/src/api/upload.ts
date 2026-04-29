import { apiPost } from './client';
import type { AssetRecord } from '@shared/types';

export interface UploadInitDirect {
  method: 'direct';
  upload_url: string;
  storage_key: string;
}

export interface UploadInitPresigned {
  method: 'presigned';
  upload_url: string;
  public_url: string;
  storage_key: string;
  headers: Record<string, string>;
  expires_at: number;
}

export type UploadInit = UploadInitDirect | UploadInitPresigned;

export const uploadApi = {
  init: (file: { mime_type: string; size_bytes: number; filename: string; hash_sha256?: string }) =>
    apiPost<UploadInit>('/upload/init', file),
  finalize: (data: {
    storage_key: string;
    mime_type: string;
    size_bytes: number;
    width?: number;
    height?: number;
    hash_sha256?: string;
  }) => apiPost<AssetRecord>('/upload/finalize', data),
};
