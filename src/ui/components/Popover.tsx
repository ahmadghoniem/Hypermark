import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import React from 'react';
import { useShape } from '@/ui/fluid/lib/shape-context';
import { SurfaceProvider, useSurface } from '@/ui/fluid/lib/surface-context';
import { surfaceClasses } from '@/ui/fluid/lib/surface-classes';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  HTMLDivElement,
  PopoverPrimitive.Popup.Props &
    Pick<PopoverPrimitive.Positioner.Props, 'side' | 'sideOffset' | 'align' | 'alignOffset'>
>(({ className, side, align = 'center', sideOffset = 6, alignOffset, children, ...props }, ref) => {
  // Fluid's popup surface: two steps above whatever it opens over, with the
  // dropdown's fixed shadow weight.
  const shape = useShape();
  const level = Math.min(useSurface() + 2, 8);
  return (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Positioner
      side={side}
      align={align}
      sideOffset={sideOffset}
      alignOffset={alignOffset}
      className="isolate z-popover"
    >
      <PopoverPrimitive.Popup
        ref={ref}
        className={`${surfaceClasses(level, 3)} ${shape.container} text-foreground z-popover outline-none origin-(--transform-origin) transition-[opacity,scale] duration-150 ease-out data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 ${className ?? ''}`}
        {...props}
      >
        <SurfaceProvider value={level}>{children}</SurfaceProvider>
      </PopoverPrimitive.Popup>
    </PopoverPrimitive.Positioner>
  </PopoverPrimitive.Portal>
  );
});

PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverTrigger, PopoverContent };
