import { createStore } from './createStore';
import type { SignatureSchema } from '@shared/types';

interface EditorState {
  signatureId: number | null;
  schema: SignatureSchema | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
}

export const editorStore = createStore<EditorState>({
  signatureId: null,
  schema: null,
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
});

export function setEditorSignature(id: number | null, schema: SignatureSchema | null): void {
  editorStore.setState({ signatureId: id, schema, isDirty: false });
}

export function markDirty(): void {
  editorStore.setState({ isDirty: true });
}

export function markSaving(saving: boolean): void {
  editorStore.setState({ isSaving: saving });
}

export function markSaved(): void {
  editorStore.setState({ isDirty: false, isSaving: false, lastSavedAt: new Date().toISOString() });
}
