import { create } from 'zustand';
import type { SignatureSchema } from '@shared/types';

interface EditorState {
  signatureId: number | null;
  name: string;
  schema: SignatureSchema | null;
  status: 'draft' | 'ready' | 'archived';
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  setSignature: (id: number | null, name: string, schema: SignatureSchema | null, status?: 'draft' | 'ready' | 'archived') => void;
  setName: (name: string) => void;
  setSchema: (schema: SignatureSchema) => void;
  markSaving: (saving: boolean) => void;
  markSaved: () => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  signatureId: null,
  name: '',
  schema: null,
  status: 'draft',
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  setSignature: (id, name, schema, status = 'draft') =>
    set({ signatureId: id, name, schema, status, isDirty: false }),
  setName: (name) => set({ name, isDirty: true }),
  setSchema: (schema) => set({ schema, isDirty: true }),
  markSaving: (isSaving) => set({ isSaving }),
  markSaved: () => set({ isDirty: false, isSaving: false, lastSavedAt: new Date().toISOString() }),
  reset: () =>
    set({
      signatureId: null,
      name: '',
      schema: null,
      status: 'draft',
      isDirty: false,
      isSaving: false,
      lastSavedAt: null,
    }),
}));
