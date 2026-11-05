import { useMemo } from 'react';
import { create } from 'zustand';
import { getConfig } from '@/bridge/apiClient';
import { EMPLOYEE_MODES, type EmployeeMode } from '@/core/schema/signature';
import { editPolicy, type EditPolicy, type LinkContext } from '@/core/schema/locks';

/**
 * Link state of the signature being edited (1.3.0): does it follow a
 * template, what does the template's employee mode allow, and can this
 * user bypass locks. Seeded from `IMGSIG_EDITOR_CONFIG.signatureLink` /
 * `canBypassLocks`; updated after "Detach from template".
 *
 * The schema store reads it ({@link currentPolicy}) to refuse edits the
 * policy forbids; components subscribe with {@link useEditPolicy}.
 */
interface LinkState extends LinkContext {
  /** The user may toggle block locks (template managers). */
  canManageLocks: boolean;
  setLink: (updates: Partial<LinkContext>) => void;
  /** Back to the bootstrap values (tests). */
  reset: () => void;
}

function isEmployeeMode(value: unknown): value is EmployeeMode {
  return (EMPLOYEE_MODES as readonly unknown[]).includes(value);
}

/** Link state from the bootstrap config (a free, detached signature when absent). */
export function linkFromConfig(): LinkContext & { canManageLocks: boolean } {
  const fallback = {
    mode: 'detached' as const,
    templateId: null,
    employeeMode: 'free' as const,
    templateName: '',
    canBypassLocks: false,
    canManageLocks: false,
  };
  try {
    const config = getConfig();
    const link = config.signatureLink;
    return {
      mode: link?.mode === 'linked' && typeof link.templateId === 'number' ? 'linked' : 'detached',
      templateId: typeof link?.templateId === 'number' ? link.templateId : null,
      employeeMode: isEmployeeMode(link?.employeeMode) ? link.employeeMode : 'free',
      templateName: typeof link?.templateName === 'string' ? link.templateName : '',
      canBypassLocks: config.canBypassLocks === true,
      canManageLocks: config.capabilities?.manage_templates === true,
    };
  } catch {
    return fallback;
  }
}

export const useLinkStore = create<LinkState>((set) => ({
  ...linkFromConfig(),
  setLink: (updates) => set(updates),
  reset: () => set(linkFromConfig()),
}));

/** The policy right now (store actions, event handlers). */
export function currentPolicy(): EditPolicy {
  return editPolicy(useLinkStore.getState());
}

/** The policy, re-rendering when the link state changes. */
export function useEditPolicy(): EditPolicy {
  const mode = useLinkStore((s) => s.mode);
  const templateId = useLinkStore((s) => s.templateId);
  const employeeMode = useLinkStore((s) => s.employeeMode);
  const canBypassLocks = useLinkStore((s) => s.canBypassLocks);
  return useMemo(
    () => editPolicy({ mode, templateId, employeeMode, canBypassLocks, templateName: '' }),
    [mode, templateId, employeeMode, canBypassLocks],
  );
}
