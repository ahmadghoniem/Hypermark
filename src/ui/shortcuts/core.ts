
export type ShortcutPlatform = 'mac' | 'non-mac';

export interface ShortcutDefinition {
  description: string;
  /** Alternative bindings for the same action, shown as “or” in the shortcuts UI. */
  bindings: string[];
  section: string;
  hint?: string;
  preventDefault?: boolean;
  /** Stable help-menu ordering within a section, without relying on object key order. */
  displayOrder?: number;
}

export interface ShortcutScopeDefinition<TAction extends string = string> {
  id: string;
  title: string;
  shortcuts: Record<TAction, ShortcutDefinition>;
}

export interface ShortcutEntry extends ShortcutDefinition {
  scopeId: string;
  scopeTitle: string;
  actionId: string;
}

export interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

export type ShortcutRegistry = readonly ShortcutScopeDefinition[];

const NAMED_TOKENS = new Set([
  'Mod',
  'Shift',
  'Alt',
  'Enter',
  'Escape',
  'Tab',
  'Space',
  'Backspace',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'A-Z',
  'hold',
  // Pointer gestures a modifier qualifies, e.g. `Alt drag`. Declarative
  // metadata for the help modal; never dispatched as a keypress.
  'drag',
  // Punctuation keys used as shortcut targets. Add new ones as needed; we
  // whitelist explicitly so typos like `Cmd` instead of `Mod` keep failing
  // validation.
  '.',
  '/',
  '[',
  ']',
  '{',
  '}',
  '?',
  '$',
]);

for (let n = 1; n <= 12; n += 1) {
  NAMED_TOKENS.add(`F${n}`);
}

const MODIFIER_TOKENS = new Set(['Mod', 'Shift', 'Alt']);
const SHIFTED_LITERAL_TOKENS = new Set(['{', '}', '?', '$']);
type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
>;

export function defineShortcutScope<TAction extends string>(scope: ShortcutScopeDefinition<TAction>): ShortcutScopeDefinition<TAction> {
  return scope;
}

function isSingleLetter(token: string): boolean {
  return /^[A-Z]$/.test(token);
}

function isSingleDigit(token: string): boolean {
  return /^[0-9]$/.test(token);
}

function getBindingTokens(binding: string): string[] {
  return binding.trim().split(/[+\s]+/).filter(Boolean);
}

function isNormalizedToken(token: string): boolean {
  return NAMED_TOKENS.has(token) || isSingleLetter(token) || isSingleDigit(token);
}

function normalizeShortcutEntry(
  scope: ShortcutScopeDefinition,
  actionId: string,
  shortcut: ShortcutDefinition,
): ShortcutEntry {
  return {
    ...shortcut,
    scopeId: scope.id,
    scopeTitle: scope.title,
    actionId,
  };
}

export function listScopeShortcuts(
  scope: ShortcutScopeDefinition,
  options?: { actionIds?: readonly string[] },
): ShortcutEntry[] {
  const allowedActionIds = options?.actionIds ? new Set(options.actionIds) : null;
  const shortcuts: ShortcutEntry[] = [];

  for (const [actionId, shortcut] of Object.entries(scope.shortcuts)) {
    if (allowedActionIds && !allowedActionIds.has(actionId)) continue;

    shortcuts.push(normalizeShortcutEntry(scope, actionId, shortcut));
  }

  return shortcuts;
}

export function validateShortcutRegistry(registry: ShortcutRegistry): string[] {
  const errors: string[] = [];
  const scopeIds = new Set<string>();

  for (const scope of registry) {
    if (scopeIds.has(scope.id)) {
      errors.push(`Duplicate shortcut scope id: ${scope.id}`);
    }
    scopeIds.add(scope.id);

    for (const [actionId, shortcut] of Object.entries(scope.shortcuts)) {
      const id = `${scope.id}.${actionId}`;

      if (!shortcut.section.trim()) {
        errors.push(`Shortcut ${id} is missing a section.`);
      }

      if (!shortcut.description.trim()) {
        errors.push(`Shortcut ${id} is missing a description.`);
      }

      if (shortcut.bindings.length === 0) {
        errors.push(`Shortcut ${id} must define at least one binding.`);
      }

      for (const binding of shortcut.bindings) {
        if (!binding.trim()) {
          errors.push(`Shortcut ${id} contains an empty binding.`);
          continue;
        }

        for (const token of getBindingTokens(binding)) {
          if (!isNormalizedToken(token)) {
            errors.push(`Shortcut ${id} uses non-normalized token \`${token}\` in binding \`${binding}\`.`);
          }
        }
      }
    }
  }

  return errors;
}

export function createShortcutRegistry<TRegistry extends ShortcutRegistry>(registry: TRegistry): TRegistry {
  const errors = validateShortcutRegistry(registry);
  if (errors.length > 0) {
    throw new Error(`Invalid shortcut registry:\n- ${errors.join('\n- ')}`);
  }
  return registry;
}

export function listRegistryShortcuts(registry: ShortcutRegistry): ShortcutEntry[] {
  const shortcuts: ShortcutEntry[] = [];

  for (const scope of registry) {
    shortcuts.push(...listScopeShortcuts(scope));
  }

  return shortcuts;
}

export function listShortcutSections(shortcuts: readonly ShortcutEntry[]): ShortcutSection[] {
  const sections = new Map<string, ShortcutEntry[]>();

  for (const shortcut of shortcuts) {
    const existing = sections.get(shortcut.section);
    if (existing) {
      existing.push(shortcut);
    } else {
      sections.set(shortcut.section, [shortcut]);
    }
  }

  return Array.from(sections.entries()).map(([title, sectionShortcuts]) => ({
    title,
    shortcuts: [...sectionShortcuts].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.description.localeCompare(b.description)),
  }));
}

export function listRegistryShortcutSections(registry: ShortcutRegistry): ShortcutSection[] {
  return listShortcutSections(listRegistryShortcuts(registry));
}

export function getShortcutPlatform(): ShortcutPlatform {
  return 'non-mac';
}

function formatKeycapToken(token: string, platform: ShortcutPlatform): string {
  if (platform === 'mac') {
    if (token === 'Mod') return '⌘';
    if (token === 'Alt') return '⌥';
    if (token === 'Shift') return '⇧';
    if (token === 'Enter') return '⏎';
    if (token === 'Escape') return 'Esc';
  }

  if (platform === 'non-mac') {
    if (token === 'Mod') return 'Ctrl';
    if (token === 'Enter') return '↵';
    if (token === 'Escape') return 'Esc';
  }

  return token;
}

export function formatShortcutBindingTokens(
  binding: string,
  platform: ShortcutPlatform = getShortcutPlatform(),
): string[] {
  return getBindingTokens(binding).map(token => formatKeycapToken(token, platform));
}

function getDigitCode(event: ShortcutKeyEvent): string | null {
  const code = typeof event.code === 'string' ? event.code : '';
  const match = code.match(/^Digit([0-9])$/);
  return match ? match[1] : null;
}

export function getShortcutDigit(event: ShortcutKeyEvent): number | null {
  const parsed = Number.parseInt(event.key, 10);
  if (!Number.isNaN(parsed)) return parsed;

  const digitCode = getDigitCode(event);
  return digitCode === null ? null : Number.parseInt(digitCode, 10);
}

function matchesKeyToken(event: ShortcutKeyEvent, token: string): boolean {
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const shortcutDigit = getShortcutDigit(event);

  if (token === 'Space') {
    return event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space';
  }

  if (token === 'A-Z') {
    return /^[A-Z]$/.test(key);
  }

  if (isSingleLetter(token)) {
    return key === token;
  }

  if (isSingleDigit(token)) {
    return key === token || String(shortcutDigit ?? '') === token;
  }

  return key === token;
}

/**
 * Match a keyboard event against one normalized, single-press binding.
 *
 * Sequential and hold bindings deliberately return false; their timing
 * semantics are handled by the shortcut runtime's dedicated paths.
 */
export function matchesShortcutBinding(event: ShortcutKeyEvent, binding: string): boolean {
  if (binding.includes(' ') || binding.includes('hold')) {
    return false;
  }

  const tokens = binding.split('+').filter(Boolean);
  if (tokens.length === 0) return false;

  const requiresMod = tokens.includes('Mod');
  const requiresShift = tokens.includes('Shift');
  const requiresAlt = tokens.includes('Alt');
  const keyTokens = tokens.filter(token => !MODIFIER_TOKENS.has(token));
  if (keyTokens.length !== 1) return false;

  const keyToken = keyTokens[0];
  const shiftMatches = requiresShift === event.shiftKey
    || (!requiresShift && keyToken === 'A-Z' && event.shiftKey)
    || (!requiresShift && SHIFTED_LITERAL_TOKENS.has(keyToken) && event.key === keyToken);

  if (requiresMod !== (event.metaKey || event.ctrlKey)) return false;
  if (!shiftMatches) return false;
  if (requiresAlt !== event.altKey) return false;

  return matchesKeyToken(event, keyToken);
}

/**
 * Match one key group from a sequential binding such as `G G`.
 *
 * The group uses the same normalized syntax as an ordinary one-press binding.
 */
export function matchesShortcutBindingGroup(event: ShortcutKeyEvent, group: string): boolean {
  return matchesShortcutBinding(event, group);
}

export function getMatchingShortcutBindingIndex(event: ShortcutKeyEvent, bindings: string[]): number {
  return bindings.findIndex(binding => matchesShortcutBinding(event, binding));
}
