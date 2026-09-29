import React from 'react';
import { DialRoot, useDialKit, type DialPosition } from 'dialkit';
import 'dialkit/styles.css';
import '../styles/dialkit-overrides.css';

export const DialsMount: React.FC = () => {
  const dials = useDialKit('00 · DialKit', {
    corner: {
      type: 'select',
      options: [
        { value: 'bottom-right', label: 'bottom-right · default · rec' },
        { value: 'bottom-left', label: 'bottom-left' },
        { value: 'top-right', label: 'top-right' },
        { value: 'top-left', label: 'top-left' },
      ],
      default: 'bottom-right',
    },
  }, { id: 'cl-00', persist: true });

  const position = (dials.corner as DialPosition) || 'bottom-right';

  return <DialRoot key={position} position={position} productionEnabled />;
};
