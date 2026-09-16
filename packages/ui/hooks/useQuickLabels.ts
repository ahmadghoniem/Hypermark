import { useCallback, useSyncExternalStore } from 'react';
import {
  getQuickLabels,
  saveQuickLabels,
  subscribeQuickLabels,
  type QuickLabel,
} from '../utils/quickLabels';

let snapshot: QuickLabel[] = getQuickLabels();
const refresh = () => { snapshot = getQuickLabels(); };
subscribeQuickLabels(refresh);

/**
 * The quick labels, live: every composer and the settings popover read the
 * same list, and a save re-renders all of them. The snapshot is cached because
 * `useSyncExternalStore` compares it by identity.
 */
export function useQuickLabels(): [QuickLabel[], (next: readonly QuickLabel[]) => void] {
  const labels = useSyncExternalStore(subscribeQuickLabels, () => snapshot, () => snapshot);
  const save = useCallback((next: readonly QuickLabel[]) => saveQuickLabels(next), []);
  return [labels, save];
}
