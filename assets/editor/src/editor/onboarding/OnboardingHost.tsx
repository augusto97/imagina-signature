import { useEffect, useRef } from 'react';
import { getConfig } from '@/bridge/apiClient';
import { useEditorStore } from '@/stores/editorStore';
import { usePersistenceStore } from '@/stores/persistenceStore';
import { useSchemaStore } from '@/stores/schemaStore';

/**
 * Opens "Create your signature" once, when the editor has finished
 * loading a NEW signature (`signatureId === 0`) whose canvas is empty
 * and no other dialog is showing.
 */
export function OnboardingHost(): null {
  const isLoaded = usePersistenceStore((s) => s.isLoaded);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || !isLoaded) return;
    decided.current = true;
    let signatureId = -1;
    try {
      signatureId = getConfig().signatureId;
    } catch {
      return;
    }
    const empty = useSchemaStore.getState().schema.blocks.length === 0;
    const { modal, openModal } = useEditorStore.getState();
    if (signatureId === 0 && empty && modal === null) openModal('onboarding');
  }, [isLoaded]);

  return null;
}
