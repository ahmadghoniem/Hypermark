import { storage } from './storage';

const STORAGE_KEY_STICKY_ACTIONS = 'hypermark-sticky-actions-enabled';
const STORAGE_KEY_SHOW_SHORT_MESSAGES = 'hypermark-show-short-messages';

export interface UIPreferences {
  stickyActionsEnabled: boolean;
  /** Whether the message rail shows one-line messages; hidden by default. */
  showShortMessages: boolean;
}

export function getUIPreferences(): UIPreferences {
  return {
    stickyActionsEnabled: storage.getItem(STORAGE_KEY_STICKY_ACTIONS) !== 'false',
    showShortMessages: storage.getItem(STORAGE_KEY_SHOW_SHORT_MESSAGES) === 'true',
  };
}

export function setShowShortMessages(show: boolean): void {
  storage.setItem(STORAGE_KEY_SHOW_SHORT_MESSAGES, String(show));
}
