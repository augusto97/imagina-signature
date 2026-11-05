import type { FC } from 'react';
import { ArrowLeft, UserRoundPen } from 'lucide-react';
import { getConfig } from '@/bridge/apiClient';
import { onBehalfOf } from '@/services/onBehalf';
import { persistence } from '@/services/persistence';
import { __ } from '@/i18n/helpers';

/**
 * Strip under the topbar while a team manager edits another user's
 * signature: whose it is, that saving compiles it with THEIR details,
 * footer and campaigns, and a way back to the Team page.
 *
 * Hidden for the user's own signatures.
 */
export const OnBehalfBanner: FC = () => {
  const owner = onBehalfOf();
  if (!owner) return null;

  const name = owner.displayName || owner.email || `#${owner.userId}`;

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-5 py-1.5 text-[12px] text-amber-900"
    >
      <UserRoundPen size={13} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <strong className="font-semibold">{__('Editing %s’s signature', name)}</strong>{' '}
        {__(
          'Changes are saved to their signature and compiled with their details, footer and campaigns.',
        )}
      </span>
      <a
        href={getConfig().signaturesUrl}
        onClick={async (e) => {
          // Flush the pending autosave before leaving, like the back arrow.
          e.preventDefault();
          await persistence.saveNow();
          window.location.href = getConfig().signaturesUrl;
        }}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 text-[11.5px] font-medium text-amber-900 transition-colors hover:bg-amber-100"
      >
        <ArrowLeft size={12} aria-hidden />
        {__('Back to Team')}
      </a>
    </div>
  );
};
