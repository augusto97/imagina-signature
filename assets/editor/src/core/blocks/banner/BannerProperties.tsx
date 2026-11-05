import type { FC } from 'react';
import type { BannerBlock } from '@/core/schema/blocks';
import { __ } from '@/i18n/helpers';
import { useSchemaStore } from '@/stores/schemaStore';
import { PropertySection } from '@/editor/sidebar-right/sections/PropertySection';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { ImageAlignInput } from '@/editor/sidebar-right/inputs/ImageAlignInput';
import { isAnimatedGif } from '../image/model';
import { ImageSourceField, type ImagePick } from '../image/ImageSourceField';
import { ResolutionHint } from '../image/ResolutionHint';
import { useNaturalSize } from '../image/useNaturalSize';
import { AltTextField, FieldHint, LinkField, StaticFallbackField } from '../image/fields';
import { resolveBanner } from './model';

interface Props {
  block: BannerBlock;
  onChange: (updates: Partial<BannerBlock>) => void;
}

/**
 * Banner inspector: image (URL / library / upload) with a resolution
 * hint, full or fixed width, alignment, corner radius, link and alt.
 */
export const BannerProperties: FC<Props> = ({ block, onChange }) => {
  const canvasWidth = useSchemaStore((s) => s.schema.canvas.width) || 600;
  const banner = resolveBanner(block);
  const known =
    banner.naturalWidth && banner.naturalHeight
      ? { width: banner.naturalWidth, height: banner.naturalHeight }
      : null;
  const natural = useNaturalSize(banner.src, known);
  const pad = (block.padding?.left ?? 0) + (block.padding?.right ?? 0);
  // Inside a column the real width is smaller; the canvas width is the
  // conservative estimate for the upload target and the hint.
  const displayWidth = banner.fullWidth
    ? Math.max(120, canvasWidth - pad)
    : Math.min(banner.width, canvasWidth);

  const applyPick = (pick: ImagePick): void =>
    onChange({
      src: pick.url,
      natural_width: pick.width,
      natural_height: pick.height,
      static_fallback_url: isAnimatedGif(pick.url) ? block.static_fallback_url : undefined,
    });

  return (
    <>
      <PropertySection title={__('Banner image')}>
        <div className="flex flex-col gap-2.5">
          <ImageSourceField
            value={banner.src}
            placeholder="https://example.com/banner.png"
            onUrlChange={(src) => onChange({ src, natural_width: undefined, natural_height: undefined })}
            onPick={applyPick}
            displayWidth={displayWidth}
            filenameBase="banner"
          />
          <ResolutionHint natural={natural.size} displayWidth={displayWidth} />
          {isAnimatedGif(banner.src) && (
            <StaticFallbackField
              value={block.static_fallback_url ?? ''}
              onChange={(v) => onChange({ static_fallback_url: v || undefined })}
            />
          )}
        </div>
      </PropertySection>

      <PropertySection title={__('Size & position')}>
        <div className="flex flex-col gap-2.5">
          <label className="flex items-center gap-2 text-[12px] text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={banner.fullWidth}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? { full_width: true }
                    : { full_width: false, width: banner.width || Math.min(600, canvasWidth) },
                )
              }
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            {__('Fill the available width')}
          </label>
          {!banner.fullWidth && (
            <>
              <DimensionInput
                label={__('Width (px)')}
                value={banner.width}
                onChange={(v) => onChange({ width: Math.max(1, Math.round(v) || 1) })}
                min={60}
                max={800}
              />
              {banner.width > canvasWidth && (
                <FieldHint tone="warning">
                  {__('Wider than the signature (%s px); it will be scaled down to fit.', String(canvasWidth))}
                </FieldHint>
              )}
              <ImageAlignInput value={banner.align} onChange={(align) => onChange({ align })} />
            </>
          )}
          <DimensionInput
            label={__('Corner radius')}
            value={banner.radius}
            onChange={(v) => onChange({ border_radius: Math.max(0, v) })}
            min={0}
            max={64}
          />
          {banner.radius > 0 && (
            <FieldHint>{__('Outlook for Windows ignores rounded corners and shows the image square.')}</FieldHint>
          )}
        </div>
      </PropertySection>

      <PropertySection title={__('Link & accessibility')}>
        <div className="flex flex-col gap-2.5">
          <LinkField
            label={__('Link URL')}
            value={block.link ?? ''}
            onChange={(link) => onChange({ link })}
          />
          <AltTextField
            value={banner.alt}
            onChange={(alt) => onChange({ alt })}
            placeholder={__('Describe what the banner shows')}
          />
        </div>
      </PropertySection>

      <PropertySection title={__('Spacing')} defaultOpen={false}>
        <PaddingInput
          value={block.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }}
          onChange={(padding) => onChange({ padding })}
        />
      </PropertySection>
    </>
  );
};
