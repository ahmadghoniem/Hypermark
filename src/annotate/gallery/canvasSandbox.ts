/**
 * Keeps the canvas from changing the real app's settings. Imported first by
 * canvas-main.tsx, before any component reads storage.
 *
 * Settings live in cookies, and cookies on localhost are shared with real
 * sessions. Here reads still fall back to the cookies, so the canvas starts
 * with your theme and labels, but writes stay in memory and end with the tab.
 * Writes to the server config (/api/config) are dropped too.
 */
import { setStorageBackend } from '@/ui/utils/storage';
import { configStore } from '@/ui/config/configStore';

const writes = new Map<string, string | null>();

const readCookie = (key: string): string | null => {
  try {
    const prefix = `${encodeURIComponent(key)}=`;
    const entry = document.cookie.split('; ').find((c) => c.startsWith(prefix));
    return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
  } catch {
    return null;
  }
};

setStorageBackend({
  getItem: (key) => (writes.has(key) ? writes.get(key)! : readCookie(key)),
  setItem: (key, value) => { writes.set(key, value); },
  removeItem: (key) => { writes.set(key, null); },
});

configStore.setServerSync(() => {});

// The completion screen closes the tab after three seconds. On the canvas the
// close is refused, which shows the screen's "could not close" state.
window.close = () => {};
