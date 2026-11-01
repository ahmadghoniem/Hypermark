import { describe, expect, test } from 'bun:test';
import { listRegistryShortcutSections, validateShortcutRegistry } from './core';
import {
  getShortcutRegistryForMode,
  type ShortcutSurfaceMode,
} from './surfaces';

const MODES: ShortcutSurfaceMode[] = ['annotate'];

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
});
