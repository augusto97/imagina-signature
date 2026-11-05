import { useState, type FC } from 'react';
import { Circle, Crop, Loader2, RefreshCw, Square, Squircle, type LucideIcon } from 'lucide-react';
import type { AvatarBlock } from '@/core/schema/blocks';
import { isUploadEnabled } from '@/bridge/apiClient';
import { __ } from '@/i18n/helpers';
import { cn } from '@/utils/cn';
import { ImageCropperModal } from '@/editor/modals/ImageCropperModal';
import { PropertySection } from '@/editor/sidebar-right/sections/PropertySection';
import { ColorInput } from '@/editor/sidebar-right/inputs/ColorInput';
import { DimensionInput } from '@/editor/sidebar-right/inputs/DimensionInput';
import { PaddingInput } from '@/editor/sidebar-right/inputs/PaddingInput';
import { ImageAlignInput } from '@/editor/sidebar-right/inputs/ImageAlignInput';
import { ImageSourceField, type ImagePick } from '../image/ImageSourceField';
import { ResolutionHint } from '../image/ResolutionHint';
import { useNaturalSize } from '../image/useNaturalSize';
import { AltTextField, FieldHint, LinkField } from '../image/fields';
import {
  AVATAR_MAX_RING,
  AVATAR_MAX_SIZE,
  AVATAR_MIN_SIZE,
  AVATAR_SOURCE_DISPLAY,
  needsProcessing,
  resolveAvatar,
  type AvatarShape,
} from './model';
import { rememberAvatarSource } from './processAvatar';
import { useAvatarProcessing, type AvatarProcessing } from './useAvatarProcessing';

interface Props {
  block: AvatarBlock;
  onChange: (updates: Partial<AvatarBlock>) => void;
}

/**
 * Avatar inspector: photo (URL / library / upload / crop), shape
 * (circle, rounded, square), size, ring, alignment, link and alt.
 * Shape and ring are baked into a hosted PNG so they also show in
 * Outlook; the panel reports that rendering and offers Retry.
 */
export const AvatarProperties: FC<Props> = ({ block, onChange }) => {
  const [cropping, setCropping] = useState(false);
  const uploads = isUploadEnabled();
  const avatar = resolveAvatar(block);
  const processing = useAvatarProcessing(block.id, onChange);
  const photo = avatar.sourceUrl || avatar.src;
  const natural = useNaturalSize(photo);

  /** Opt a pasted / legacy photo into rendering when the user restyles it. */
  const optIn = (): Partial<AvatarBlock> =>
    uploads && !avatar.sourceUrl && avatar.src ? { source_url: avatar.src } : {};

  const applyPick = (pick: ImagePick): void => {
    if (pick.source === 'url') {
      onChange({ src: pick.url, source_url: undefined, processed: undefined });
      return;
    }
    rememberAvatarSource(pick.url, pick.blob);
    processing.commitNow({ source_url: pick.url, src: pick.url, processed: undefined });
  };

  const shapes: Array<{ value: AvatarShape; label: string; icon: LucideIcon }> = [
    { value: 'circle', label: __('Circle'), icon: Circle },
    { value: 'rounded', label: __('Rounded'), icon: Squircle },
    { value: 'square', label: __('Square'), icon: Square },
  ];

  return (
    <>
      <PropertySection title={__('Photo')}>
        <div className="flex flex-col gap-2.5">
          <ImageSourceField
            value={photo}
            onUrlChange={(src) => onChange({ src, source_url: undefined, processed: undefined })}
            onPick={applyPick}
            displayWidth={AVATAR_SOURCE_DISPLAY}
            filenameBase="avatar"
          />
          {uploads && (
            <button
              type="button"
              disabled={!photo || processing.status === 'working'}
              onClick={() => setCropping(true)}
              className="inline-flex h-7 w-fit items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Crop size={12} />
              {__('Crop image')}
            </button>
          )}
          <ProcessingStatus processing={processing} stale={uploads && needsProcessing(avatar)} />
          {uploads && !avatar.sourceUrl && avatar.src && avatar.shape !== 'square' && (
            <div className="flex flex-col items-start gap-1.5 rounded-md bg-[var(--bg-panel-soft)] p-2">
              <FieldHint>
                {__('This photo is used as-is, so Outlook for Windows shows it square.')}
              </FieldHint>
              <button
                type="button"
                disabled={processing.status === 'working'}
                onClick={() => processing.commitNow({ source_url: avatar.src })}
                className="inline-flex h-6 items-center rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] px-2 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {__('Make it round in every client')}
              </button>
            </div>
          )}
          <ResolutionHint natural={natural.size} displayWidth={avatar.size} />
        </div>
      </PropertySection>

      <PropertySection title={__('Shape & size')}>
        <div className="flex flex-col gap-2.5">
          <div>
            <span className="is-section-label mb-1 block">{__('Shape')}</span>
            <div
              role="radiogroup"
              aria-label={__('Shape')}
              className="grid grid-cols-3 gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-panel-soft)] p-0.5"
            >
              {shapes.map((option) => {
                const Icon = option.icon;
                const active = option.value === avatar.shape;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={processing.status === 'working'}
                    onClick={() =>
                      active ? undefined : processing.commitNow({ shape: option.value, ...optIn() })
                    }
                    className={cn(
                      'inline-flex h-7 items-center justify-center gap-1.5 rounded text-[11.5px] transition-colors disabled:cursor-wait',
                      active
                        ? 'bg-[var(--bg-panel)] font-medium text-[var(--accent)] shadow-[var(--shadow-sm)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    <Icon size={12} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <DimensionInput
            label={__('Size')}
            value={avatar.size}
            // Not clamped while typing ("6" on the way to "64"); compile clamps.
            onChange={(v) => processing.commitLater({ size: Math.max(0, Math.round(v)) })}
            min={AVATAR_MIN_SIZE}
            max={AVATAR_MAX_SIZE}
          />
          <ImageAlignInput value={avatar.align} onChange={(align) => onChange({ align })} />
        </div>
      </PropertySection>

      <PropertySection title={__('Ring')}>
        <div className="flex flex-col gap-2.5">
          <DimensionInput
            label={__('Ring width')}
            value={avatar.ringWidth}
            onChange={(v) =>
              processing.commitLater({
                ring_width: Math.max(0, Math.min(AVATAR_MAX_RING, Math.round(v) || 0)),
                ...(v > 0 ? optIn() : {}),
              })
            }
            min={0}
            max={AVATAR_MAX_RING}
          />
          {avatar.ringWidth > 0 && (
            <ColorInput
              label={__('Ring color')}
              value={avatar.ringColor}
              onChange={(ring_color) => processing.commitLater({ ring_color })}
            />
          )}
          {!uploads && (avatar.ringWidth > 0 || avatar.shape !== 'circle') && (
            <FieldHint tone="warning">
              {__('Uploads are disabled, so the shape and ring are drawn with CSS: Outlook for Windows shows a square photo with a square frame.')}
            </FieldHint>
          )}
        </div>
      </PropertySection>

      <PropertySection title={__('Link & accessibility')}>
        <div className="flex flex-col gap-2.5">
          <AltTextField
            value={avatar.alt}
            onChange={(alt) => onChange({ alt })}
            placeholder={__('e.g. Photo of Jane Doe')}
          />
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
        src={photo}
        aspect={1}
        cropShape={avatar.shape === 'circle' ? 'round' : 'rect'}
        displayWidth={AVATAR_SOURCE_DISPLAY}
        filenameBase="avatar"
        onCancel={() => setCropping(false)}
        onConfirm={(result) => {
          setCropping(false);
          rememberAvatarSource(result.url, result.blob);
          // The crop is the new (unmasked) source; the mask is baked next.
          processing.commitNow({ source_url: result.url, src: result.url, processed: undefined });
        }}
      />
    </>
  );
};

const ProcessingStatus: FC<{ processing: AvatarProcessing; stale: boolean }> = ({
  processing,
  stale,
}) => {
  if (processing.status === 'working' || processing.status === 'pending') {
    return (
      <p className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-muted)]" aria-live="polite">
        <Loader2 size={11} className="animate-spin" />
        {__('Preparing the avatar for every email client…')}
      </p>
    );
  }
  if (processing.status === 'error') {
    return (
      <p role="alert" className="flex items-start gap-1.5 text-[10.5px] leading-snug text-red-700">
        <span className="flex-1">
          {__('The avatar could not be prepared (%s). It is shown with CSS only, so Outlook may show it square.', processing.error ?? '')}
        </span>
        <button
          type="button"
          onClick={processing.renderNow}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1 font-medium text-red-700 hover:bg-red-50"
        >
          <RefreshCw size={10} />
          {__('Retry')}
        </button>
      </p>
    );
  }
  if (stale) {
    return (
      <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-[var(--text-muted)]">
        <span className="flex-1">{__('The hosted image does not match these settings yet.')}</span>
        <button
          type="button"
          onClick={processing.renderNow}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1 font-medium text-[var(--accent)] hover:bg-[var(--bg-selected)]"
        >
          <RefreshCw size={10} />
          {__('Update image')}
        </button>
      </p>
    );
  }
  return null;
};
