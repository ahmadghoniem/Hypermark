/**
 * Open-in-App Catalog — single source of truth.
 *
 * Shared between the Bun/Pi servers (which launch the app) and the UI (which
 * renders the picker). Runtime-agnostic: no Bun or Node-specific APIs, pure
 * data + types only.
 *
 * Windows only. Each entry declares a PATH binary launched as
 * `<bin> <target>`.
 *
 * `kind` drives launch semantics:
 *   - file-manager -> reveal the file (`explorer /select,`)
 *   - editor       -> open the file itself
 *   - terminal     -> open the file's parent directory
 *
 * One special id has no launch field:
 *   - 'reveal' (kind file-manager) — uses Explorer
 */

export type OpenInKind = 'file-manager' | 'editor' | 'terminal';

export interface OpenInApp {
  /** Stable identifier persisted in the cookie + sent to the server. */
  id: string;
  /** Human-readable label. */
  label: string;
  kind: OpenInKind;
  /** Icon id understood by AppIcon. */
  icon: string;
  /** PATH binary. */
  win?: { bin: string };
}

/**
 * The catalog, in menu order. The UI groups by `kind`
 * (file-manager + default first, then editors, then terminals).
 */
export const OPEN_IN_APPS: OpenInApp[] = [
  // ── File manager (always available) ────────────────────────────────────
  {
    id: 'reveal',
    label: 'Explorer',
    kind: 'file-manager',
    icon: 'file-explorer',
  },

  // ── Editors ────────────────────────────────────────────────────────────
  {
    id: 'vscode',
    label: 'VS Code',
    kind: 'editor',
    icon: 'vscode',
    win: { bin: 'code' },
  },
  {
    id: 'cursor',
    label: 'Cursor',
    kind: 'editor',
    icon: 'cursor',
    win: { bin: 'cursor' },
  },
  {
    id: 'zed',
    label: 'Zed',
    kind: 'editor',
    icon: 'zed',
    win: { bin: 'zed' },
  },
  {
    id: 'sublime-text',
    label: 'Sublime Text',
    kind: 'editor',
    icon: 'sublime-text',
    win: { bin: 'subl' },
  },

  // ── Terminals ──────────────────────────────────────────────────────────
  {
    id: 'powershell',
    label: 'PowerShell',
    kind: 'terminal',
    icon: 'powershell',
    win: { bin: 'powershell' },
  },
];

/**
 * Look up a catalog entry by id.
 */
export function getOpenInApp(id: string): OpenInApp | undefined {
  return OPEN_IN_APPS.find((app) => app.id === id);
}
