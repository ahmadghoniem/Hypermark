import { storage } from './storage';

const STORAGE_KEY_STICKY_ACTIONS = 'hypermark-sticky-actions-enabled';

export interface UIPreferences {
  stickyActionsEnabled: boolean;
}

export function getUIPreferences(): UIPreferences {
  return {
    stickyActionsEnabled: storage.getItem(STORAGE_KEY_STICKY_ACTIONS) !== 'false',
  };
}

export function saveUIPreferences(prefs: UIPreferences): void {
  storage.setItem(STORAGE_KEY_STICKY_ACTIONS, String(prefs.stickyActionsEnabled));
}
