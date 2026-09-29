import { describe, expect, it } from 'bun:test';
import {
  createShortcutRegistry,
  defineShortcutScope,
  dispatchShortcutEvent,
  formatShortcutBindingTokens,
  matchesShortcutBinding,
  validateShortcutRegistry,
} from './shortcuts';

describe('shortcuts', () => {
  it('formats bindings for keycaps', () => {
    expect(formatShortcutBindingTokens('Mod+Enter', 'mac')).toEqual(['⌘', '⏎']);
    expect(formatShortcutBindingTokens('Mod+Enter', 'non-mac')).toEqual(['Ctrl', '↵']);
  });

  it('validates duplicate scope ids and non-normalized tokens', () => {
    const duplicateScope = defineShortcutScope({
      id: 'dup',
      title: 'Duplicate',
      shortcuts: {
        submit: {
          description: 'Submit',
          bindings: ['Mod+Enter'],
          section: 'Actions',
        },
      },
    });

    const badScope = defineShortcutScope({
      id: 'bad',
      title: 'Bad',
      shortcuts: {
        broken: {
          description: 'Broken',
          bindings: ['Cmd+Enter'],
          section: 'Actions',
        },
        missingCopy: {
          description: '',
          bindings: ['Mod+C'],
          section: '',
        },
      },
    });

    const errors = validateShortcutRegistry([duplicateScope, duplicateScope, badScope]);

    expect(errors).toContain('Duplicate shortcut scope id: dup');
    expect(errors.some(error => error.includes('Cmd'))).toBe(true);
    expect(errors).toContain('Shortcut bad.missingCopy is missing a section.');
    expect(errors).toContain('Shortcut bad.missingCopy is missing a description.');
    expect(() => createShortcutRegistry([duplicateScope, duplicateScope])).toThrow();
  });


  it('matches normalized runtime bindings', () => {
    const submitEvent = { key: 'Enter', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, code: 'Enter' } as KeyboardEvent;
    const reverseSearchEvent = { key: 'F3', ctrlKey: false, metaKey: false, shiftKey: true, altKey: false, code: 'F3' } as KeyboardEvent;
    const typeEvent = { key: 'A', ctrlKey: false, metaKey: false, shiftKey: true, altKey: false, code: 'KeyA' } as KeyboardEvent;
    const wrongEvent = { key: 'Enter', ctrlKey: false, metaKey: false, shiftKey: false, altKey: true, code: 'Enter' } as KeyboardEvent;
    const spaceEvent = {
      key: ' ',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      code: 'Space',
    };
    const questionEvent = {
      key: '?',
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      altKey: false,
      code: 'Slash',
    };

    expect(matchesShortcutBinding(submitEvent, 'Mod+Enter')).toBe(true);
    expect(matchesShortcutBinding(reverseSearchEvent, 'Shift+F3')).toBe(true);
    expect(matchesShortcutBinding(typeEvent, 'A-Z')).toBe(true);
    expect(matchesShortcutBinding(spaceEvent, 'Space')).toBe(true);
    expect(matchesShortcutBinding(questionEvent, '?')).toBe(true);
    expect(matchesShortcutBinding(wrongEvent, 'Mod+Enter')).toBe(false);
  });

  it('dispatches matching registry actions', () => {
    const testScope = defineShortcutScope({
      id: 'test-actions',
      title: 'Test Actions',
      shortcuts: {
        submitPlan: {
          description: 'Submit',
          bindings: ['Mod+Enter'],
          section: 'Actions',
        },
        quickSave: {
          description: 'Save',
          bindings: ['Mod+S'],
          section: 'Actions',
        },
      },
    });
    const registry = createShortcutRegistry([testScope]);
    const calls: string[] = [];
    const event = { key: 'Enter', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false } as KeyboardEvent;

    const handled = dispatchShortcutEvent(registry[0], {
      submitPlan: () => calls.push('submitPlan'),
      quickSave: () => calls.push('quickSave'),
    }, event);

    expect(handled).toBe(true);
    expect(calls).toEqual(['submitPlan']);
  });

  it('supports guarded handlers and continues after a failed guard', () => {
    const guardedScope = defineShortcutScope({
      id: 'guarded',
      title: 'Guarded',
      shortcuts: {
        primary: {
          description: 'Primary',
          bindings: ['Enter'],
          section: 'Actions',
          preventDefault: true,
        },
        fallback: {
          description: 'Fallback',
          bindings: ['Enter'],
          section: 'Actions',
          preventDefault: true,
        },
      },
    });

    const calls: string[] = [];
    const event = {
      key: 'Enter',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: () => calls.push('preventDefault'),
    } as unknown as KeyboardEvent;

    const handled = dispatchShortcutEvent(guardedScope, {
      primary: {
        when: () => false,
        handle: () => calls.push('primary'),
      },
      fallback: {
        when: () => true,
        handle: () => calls.push('fallback'),
      },
    }, event);

    expect(handled).toBe(true);
    expect(calls).toEqual(['preventDefault', 'fallback']);
  });

  it('does not handle or prevent default when a guard fails', () => {
    const guardedScope = defineShortcutScope({
      id: 'guarded-skip',
      title: 'Guarded Skip',
      shortcuts: {
        save: {
          description: 'Save',
          bindings: ['Mod+S'],
          section: 'Actions',
          preventDefault: true,
        },
      },
    });

    let preventDefaultCalls = 0;
    const event = {
      key: 's',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: () => {
        preventDefaultCalls += 1;
      },
    } as unknown as KeyboardEvent;

    const handled = dispatchShortcutEvent(guardedScope, {
      save: {
        when: () => false,
        handle: () => {
          throw new Error('should not run');
        },
      },
    }, event);

    expect(handled).toBe(false);
    expect(preventDefaultCalls).toBe(0);
  });
});
