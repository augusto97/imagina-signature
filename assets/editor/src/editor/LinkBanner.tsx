import { useState, type FC } from 'react';
import { Link2, Lock, Unlink } from 'lucide-react';
import { useEditPolicy, useLinkStore } from '@/stores/linkStore';
import { detachFromTemplate } from '@/services/templateLink';
import { __ } from '@/i18n/helpers';
import { ConfirmDialog } from './modals/ConfirmDialog';

/**
 * Strip under the topbar for a signature built from a company template
 * (1.3.0): which template it follows, what the employee mode lets the
 * user change, and — when allowed — "Detach from template".
 *
 * Hidden for signatures that are neither linked nor restricted.
 */
export const LinkBanner: FC = () => {
  const mode = useLinkStore((s) => s.mode);
  const templateName = useLinkStore((s) => s.templateName);
  const canBypassLocks = useLinkStore((s) => s.canBypassLocks);
  const policy = useEditPolicy();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (mode !== 'linked' && !policy.enforced) return null;

  const linked = mode === 'linked';
  const title = templateName
    ? linked
      ? __('Follows the company template “%s”.', templateName)
      : __('Built from the company template “%s”.', templateName)
    : linked
      ? __('Follows a company template.')
      : __('Built from a company template.');

  let detail: string;
  if (canBypassLocks) {
    detail = __(
      'You manage templates, so locks don’t apply to you. Template updates replace the design and keep the text overrides.',
    );
  } else if (policy.employeeMode === 'fields_only') {
    detail = __('Fill in your details — the design is managed by your company.');
  } else if (policy.employeeMode === 'locked_design') {
    detail = __(
      'You can change the text of unlocked blocks. The design is managed by your company.',
    );
  } else {
    detail = __(
      'Template updates replace the design; your text and details are kept. Locked blocks can’t be changed.',
    );
  }

  const detach = async (): Promise<void> => {
    setBusy(true);
    const done = await detachFromTemplate();
    setBusy(false);
    if (done) setConfirming(false);
  };

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-selected)] px-5 py-1.5 text-[12px] text-[var(--text-secondary)]"
    >
      {policy.enforced && !linked ? (
        <Lock size={13} className="shrink-0 text-[var(--accent)]" />
      ) : (
        <Link2 size={13} className="shrink-0 text-[var(--accent)]" />
      )}
      <span className="min-w-0 flex-1 truncate">
        <strong className="font-semibold text-[var(--text-primary)]">{title}</strong> {detail}
      </span>
      {policy.canDetach && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-2.5 text-[11.5px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          <Unlink size={12} />
          {__('Detach from template')}
        </button>
      )}
      <ConfirmDialog
        open={confirming}
        title={__('Detach from template?')}
        confirmLabel={busy ? __('Detaching…') : __('Detach')}
        tone="danger"
        onConfirm={() => {
          if (!busy) void detach();
        }}
        onCancel={() => {
          if (!busy) setConfirming(false);
        }}
      >
        <p>
          {__(
            'The signature keeps its current design and your text, but it becomes your own copy: future template updates will no longer reach it. This cannot be undone.',
          )}
        </p>
      </ConfirmDialog>
    </div>
  );
};
