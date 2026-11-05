import type { FC } from 'react';
import { MoonStar } from 'lucide-react';
import type { CompiledImage } from '@/core/compiler/images';
import { blockLabel } from '@/core/compiler/issues';
import { __, _n } from '@/i18n/helpers';
import type { DarkImageCandidate } from './darkImages';
import { addLightBackground, useDarkImageRisks } from './useDarkImageRisks';

/**
 * "May disappear in dark mode" warning with a one-click fix per block.
 * Renders nothing until an analysed image turns out risky.
 */
export const DarkModeImageWarnings: FC<{ images: CompiledImage[]; enabled: boolean }> = ({
  images,
  enabled,
}) => {
  const risks = useDarkImageRisks(images, enabled);
  if (risks.length === 0) return null;
  const byBlock = new Map<string, DarkImageCandidate>();
  for (const r of risks) if (!byBlock.has(r.blockId)) byBlock.set(r.blockId, r);

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900"
    >
      <div className="flex items-center gap-1.5 font-semibold">
        <MoonStar size={13} />
        {_n(
          '%s image may disappear in dark mode',
          '%s images may disappear in dark mode',
          byBlock.size,
          String(byBlock.size),
        )}
      </div>
      <p className="leading-relaxed text-amber-800">
        {__(
          'These logos or icons are mostly dark on a transparent background. Clients that paint the message dark (Gmail and Outlook apps, Outlook.com, Apple Mail) can show them dark on dark. A light background behind them keeps them readable; a version of the image with a light outline is even more robust.',
        )}
      </p>
      <ul className="flex flex-col gap-1.5">
        {Array.from(byBlock.values()).map((risk) => (
          <li key={risk.blockId} className="flex items-center gap-2">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-amber-200 bg-[#1f1f1f]"
              aria-hidden="true"
            >
              <img src={risk.src} alt="" className="max-h-[28px] max-w-[28px] object-contain" />
            </span>
            <span className="min-w-0 flex-1 truncate">
              {risk.alt
                ? `${blockLabel(risk.blockType)} — ${risk.alt}`
                : blockLabel(risk.blockType)}
            </span>
            <button
              type="button"
              onClick={() => addLightBackground(risk.blockId)}
              className="inline-flex h-7 shrink-0 items-center rounded-md bg-amber-600 px-2.5 font-medium text-white transition-colors hover:bg-amber-700"
            >
              {__('Add light background')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
