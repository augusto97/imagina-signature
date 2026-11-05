import { useState, type FC } from 'react';
import { Crop } from 'lucide-react';
import type { ImageBlock } from '@/core/schema/blocks';
import { isUploadEnabled } from '@/bridge/apiClient';
import { __ } from '@/i18n/helpers';
import { useSchemaStore } from '@/stores/schemaStore';
import { ImageCropperModal } from '@/editor/modals/ImageCropperModal';
import { PropertySection } from '@/editor/sidebar-right/sections/PropertySection';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { ImageAlignInput } from '@/editor/sidebar-right/inputs/ImageAlignInput';
import { ImageBorderInput } from '@/editor/sidebar-right/inputs/ImageBorderInput';
import { ImageSizeInput, type ImageSizePatch } from '@/editor/sidebar-right/inputs/ImageSizeInput';
import { aspectRatio, isAnimatedGif, resolveImage } from './model';
import { useNaturalSize } from './useNaturalSize';
import { ResolutionHint } from './ResolutionHint';
import { ImageSourceField, type ImagePick } from './ImageSourceField';
import { AltTextField, FieldHint, LinkField, StaticFallbackField } from './fields';

interface Props {
  block: ImageBlock;
  onChange: (updates: Partial<ImageBlock>) => void;
}

/**
 * Image block inspector: source (URL / library / upload / crop) with a
 * resolution hint, size with aspect lock, alignment, corner radius,
 * border, link + alt text and spacing.
 */
export const ImageProperties: FC<Props> = ({ block, onChange }) => {
  const [cropping, setCropping] = useState(false);
  const canvasWidth = useSchemaStore((s) => s.schema.canvas.width);
  const image = resolveImage(block);
  const known =
    image.naturalWidth && image.naturalHeight
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : null;
  const natural = useNaturalSize(image.src, known);
  const naturalSize = natural.size;
  const displayWidth =
    image.width ?? Math.min(naturalSize?.width ?? canvasWidth ?? 600, canvasWidth || 600);
  const ratio = aspectRatio(naturalSize, image.width, image.height);

  /** Height that keeps `width` on the new image's aspect (locked only). */
  const heightFor = (w: number | null, size: { width?: number; height?: number }): Partial<ImageBlock> =>
    image.lockAspect && w && size.width && size.height
      ? { height: Math.max(1, Math.round((w * size.height) / size.width)) }
      : {};

  const applyPick = (pick: ImagePick): void => {
    onChange({
      src: pick.url,
      natural_width: pick.width,
      natural_height: pick.height,
      ...heightFor(image.width, pick),
      // A fallback only makes sense for a GIF; keep it for GIF → GIF.
      static_fallback_url: isAnimatedGif(pick.url) ? block.static_fallback_url : undefined,
    });
  };

  const applySize = (patch: ImageSizePatch): void => {
    // Record the probed intrinsic size alongside an explicit edit (it is
    // never written on its own, which would create a phantom undo step).
    const intrinsic =
      !known && naturalSize && natural.src === image.src
        ? { natural_width: naturalSize.width, natural_height: naturalSize.height }
        : {};
    onChange({ ...intrinsic, ...patch });
  };

  return (
    <>
      <PropertySection title={__('Image')}>
        <div className="flex flex-col gap-2.5">
          <ImageSourceField
            value={image.src}
            onUrlChange={(src) =>
              onChange({ src, natural_width: undefined, natural_height: undefined })
            }
            onPick={applyPick}
            displayWidth={displayWidth}
            filenameBase="image"
          />
          {/* Cropping renders a new image and uploads it — hidden in
              URL-only mode. */}
          {isUploadEnabled() && (
            <button
              type="button"
              disabled={!image.src}
              onClick={() => setCropping(true)}
              className="inline-flex h-7 w-fit items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Crop size={12} />
              {__('Crop image')}
            </button>
          )}
          <ResolutionHint natural={naturalSize} displayWidth={displayWidth} />
          {isAnimatedGif(image.src) && (
            <StaticFallbackField
              value={block.static_fallback_url ?? ''}
              onChange={(v) => onChange({ static_fallback_url: v || undefined })}
            />
          )}
        </div>
      </PropertySection>

      <PropertySection title={__('Size & position')}>
        <div className="flex flex-col gap-2.5">
          <ImageSizeInput
            width={image.width ?? undefined}
            height={image.height ?? undefined}
            lock={image.lockAspect}
            ratio={ratio}
            onChange={applySize}
            maxWidth={Math.max(800, canvasWidth || 0)}
          />
          {!image.width && (
            <FieldHint>{__('No width set: the image uses its own size, capped to the space available.')}</FieldHint>
          )}
          <ImageAlignInput value={image.align} onChange={(align) => onChange({ align })} />
        </div>
      </PropertySection>

      <PropertySection title={__('Style')}>
        <div className="flex flex-col gap-2.5">
          <DimensionInput
            label={__('Corner radius')}
            value={image.radius}
            onChange={(v) => onChange({ border_radius: Math.max(0, v) })}
            min={0}
            max={200}
          />
          {image.radius > 0 && (
            <FieldHint>{__('Outlook for Windows ignores rounded corners and shows the image square.')}</FieldHint>
          )}
          <ImageBorderInput value={block.border} onChange={(border) => onChange({ border })} />
        </div>
      </PropertySection>

      <PropertySection title={__('Link & accessibility')}>
        <div className="flex flex-col gap-2.5">
          <AltTextField value={image.alt} onChange={(alt) => onChange({ alt })} />
          <LinkField value={block.link ?? ''} onChange={(v) => onChange({ link: v || undefined })} />
        </div>
      </PropertySection>

      <PropertySection title={__('Spacing')} defaultOpen={false}>
        <PaddingInput
          value={block.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }}
          onChange={(padding) => onChange({ padding })}
        />
      </PropertySection>

      <ImageCropperModal
        open={cropping}
        src={image.src}
        displayWidth={displayWidth}
        filenameBase="image"
        onCancel={() => setCropping(false)}
        onConfirm={(result) => {
          onChange({
            src: result.url,
            natural_width: result.width,
            natural_height: result.height,
            ...heightFor(image.width, result),
          });
          setCropping(false);
        }}
      />
    </>
  );
};
