import type { FC } from 'react';
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import type { TextAlign } from '@/core/schema/styles';
import { __ } from '@/i18n/helpers';
import { SegmentedInput } from './SegmentedInput';

interface Props {
  label?: string;
  value: TextAlign | undefined;
  onChange: (value: TextAlign) => void;
}

/** Left / centre / right segmented control. Unset reads as left. */
export const AlignInput: FC<Props> = ({ label, value, onChange }) => (
  <SegmentedInput<TextAlign>
    label={label ?? __('Alignment')}
    value={value ?? 'left'}
    onChange={onChange}
    options={[
      { value: 'left', label: __('Align left'), content: <AlignLeft size={13} /> },
      { value: 'center', label: __('Align center'), content: <AlignCenter size={13} /> },
      { value: 'right', label: __('Align right'), content: <AlignRight size={13} /> },
    ]}
  />
);
