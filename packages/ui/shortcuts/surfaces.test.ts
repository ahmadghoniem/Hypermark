import { describe, expect, test } from 'bun:test';
import { listRegistryShortcutSections, validateShortcutRegistry } from './core';
import {
  annotateShortcutRegistry,
  getShortcutRegistryForMode,
  planShortcutRegistry,
  reviewShortcutRegistry,
  type ShortcutSurfaceMode,
} from './surfaces';

const MODES: ShortcutSurfaceMode[] = ['plan', 'annotate', 'review'];

describe('shortcut surfaces', () => {
  test('every surface is internally consistent', () => {
    for (const mode of MODES) {
      expect(validateShortcutRegistry(getShortcutRegistryForMode(mode))).toEqual([]);
    }
  });

  test('every surface renders at least one section, and every row has a binding', () => {
    for (const mode of MODES) {
      const sections = listRegistryShortcutSections(getShortcutRegistryForMode(mode));
      expect(sections.length).toBeGreaterThan(0);
      for (const section of sections) {
        expect(section.title).not.toBe('');
        for (const shortcut of section.shortcuts) {
          expect(shortcut.description).not.toBe('');
          expect(shortcut.bindings.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test('annotate is plan plus its sidebar, never less', () => {
    const planIds = new Set(planShortcutRegistry.map((scope) => scope.id));
    const annotateIds = new Set(annotateShortcutRegistry.map((scope) => scope.id));
    for (const id of planIds) expect(annotateIds.has(id)).toBe(true);
    expect(annotateIds.has('annotate-sidebar')).toBe(true);
  });

  test('review carries the chrome scope the panel used to hand-type', () => {
    expect(reviewShortcutRegistry.map((scope) => scope.id)).toContain('review-chrome');
  });

  // The drift this whole arrangement exists to prevent: the old hand-typed
  // panel documented `A` to stage a file and `Alt Alt` to switch feedback
  // destination long after both features were deleted.
  test('review documents no shortcut for a feature that is gone', () => {
    const descriptions = listRegistryShortcutSections(reviewShortcutRegistry)
      .flatMap((section) => section.shortcuts.map((s) => s.description.toLowerCase()));
    expect(descriptions.some((d) => d.includes('stage') || d.includes('git add'))).toBe(false);
    expect(descriptions.some((d) => d.includes('destination'))).toBe(false);
  });
});
