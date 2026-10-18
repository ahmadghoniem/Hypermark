import React, { useEffect, useState } from 'react';
import { useIsMac } from '@/ui/fluid/components/command-menu';
import { cn } from '../lib/utils';

/**
 * Whether Ctrl (Cmd on a Mac) is held. Read from key and pointer events, so
 * a hint mounted while the key is already down catches up on the next
 * pointer move; cleared when the window loses focus, which eats the keyup.
 */
function useModHeld(isMac: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const read = (e: KeyboardEvent | PointerEvent) => setHeld(isMac ? e.metaKey : e.ctrlKey);
    const clear = () => setHeld(false);
    window.addEventListener('keydown', read);
    window.addEventListener('keyup', read);
    window.addEventListener('pointermove', read);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', read);
      window.removeEventListener('keyup', read);
      window.removeEventListener('pointermove', read);
      window.removeEventListener('blur', clear);
    };
  }, [isMac]);
  return held;
}

/**
 * A Ctrl / Cmd shortcut for a tooltip, such as "Ctrl Enter". The modifier
 * turns to the foreground colour while it is held, so the hint shows that
 * only the key after it is missing.
 */
export const ModShortcut: React.FC<{ keyName: string }> = ({ keyName }) => {
  const isMac = useIsMac();
  const held = useModHeld(isMac);
  return (
    <span className="text-muted-foreground">
      <span className={cn('transition-colors duration-100', held && 'text-foreground')}>{isMac ? '⌘' : 'Ctrl'}</span>
      {' '}{keyName}
    </span>
  );
};
