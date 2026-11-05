import type { FC } from 'react';
import { __ } from '@admin/i18n';
import { cn } from '@admin/utils/cn';

interface Props {
  size?: number;
  className?: string;
}

/**
 * Bare CSS spinner — no animation libraries, just a rotating ring.
 */
export const Spinner: FC<Props> = ({ size = 16, className }) => (
  <span
    aria-label={__('Loading')}
    role="status"
    className={cn('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    style={{ width: size, height: size }}
  />
);
