/**
 * Cookie-based storage utility
 *
 * Uses cookies instead of localStorage so settings persist across
 * different ports (each hook invocation uses a random port).
 * Cookies are scoped by domain, not port, so localhost:54321 and
 * localhost:54322 share the same cookies.
 */

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Default backend: cookies.
 * Used instead of localStorage so settings persist across the random ports each
 * hook invocation uses (cookies are scoped by domain, not port).
 */
const cookieBackend: StorageBackend = {
  getItem(key) {
    try {
      const match = document.cookie.match(new RegExp(`(?:^|; )${escapeRegex(key)}=([^;]*)`));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (e) {
      return null;
    }
  },
  setItem(key, value) {
    try {
      const encoded = encodeURIComponent(value);
      document.cookie = `${key}=${encoded}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
    } catch (e) {
      // Cookie not available
    }
  },
  removeItem(key) {
    try {
      document.cookie = `${key}=; path=/; max-age=0`;
    } catch (e) {
      // Cookie not available
    }
  },
};

// Active backend. Defaults to cookies so Hypermark is unchanged. A host
// (e.g. Workspaces) calls setStorageBackend once at startup to persist settings
// through its own storage instead.
let backend: StorageBackend = cookieBackend;

/** Override the storage backend. Call once at app startup. */
export function setStorageBackend(b: StorageBackend): void {
  backend = b;
}

/** Reset to the default (cookie) backend. Mainly for tests. */
export function resetStorageBackend(): void {
  backend = cookieBackend;
}

/**
 * Get a value from storage (default = cookies)
 */
export function getItem(key: string): string | null {
  return backend.getItem(key);
}

/**
 * Set a value in storage (default = cookies)
 */
export function setItem(key: string, value: string): void {
  backend.setItem(key, value);
}

/**
 * Remove a value from storage (default = cookies)
 */
export function removeItem(key: string): void {
  backend.removeItem(key);
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Storage object with localStorage-like API
 */
export const storage = {
  getItem,
  setItem,
  removeItem,
};
