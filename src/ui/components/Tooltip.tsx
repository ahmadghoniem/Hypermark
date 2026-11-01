import React from 'react';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';

/**
 * TooltipProvider keeps the Radix-era prop names (`delayDuration`,
 * `skipDelayDuration`) as its public API and maps them onto Base UI's
 * Provider (`delay`, `timeout`).
 */
interface TooltipProviderProps {
  delayDuration?: number;
  skipDelayDuration?: number;
  children?: React.ReactNode;
}

export const TooltipProvider: React.FC<TooltipProviderProps> = ({
  delayDuration,
  skipDelayDuration,
  children,
}) => (
  <BaseTooltip.Provider delay={delayDuration} timeout={skipDelayDuration}>
    {children}
  </BaseTooltip.Provider>
);
