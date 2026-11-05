import type { FC } from 'react';
import { ScanEye } from 'lucide-react';
import { __ } from '@/i18n/helpers';
import type { NaturalSize } from '@/services/imageDecode';
import { isLowResolution, retinaPixelWidth } from './model';

/**
 * Retina hint: shown when the image has fewer than 2× the pixels it is
 * displayed at, so it may look blurry on high-resolution screens.
 */
export const ResolutionHint: FC<{ natural: NaturalSize | null; displayWidth: number }> = ({
  natural,
  displayWidth,
}) => {
  if (!natural || !isLowResolution(natural, displayWidth)) return null;
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[10.5px] leading-snug text-amber-800">
      <ScanEye size={12} className="mt-px shrink-0" />
      <span>
        {__(
          'This image is %1$s px wide; shown at %2$s px it may look blurry on high-resolution screens. Use one at least %3$s px wide.',
          String(natural.width),
          String(Math.round(displayWidth)),
          String(retinaPixelWidth(displayWidth)),
        )}
      </span>
    </p>
  );
};
