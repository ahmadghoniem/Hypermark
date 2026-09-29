import { defineShortcutScope } from '../core';

export const annotationModeShortcuts = defineShortcutScope({
  id: 'annotation-mode',
  title: 'Annotation Mode',
  shortcuts: {
    // Declarative metadata for the help modal only. Not dispatched through
    // `useShortcutScope`: `useAnnotationHighlighter` reads `altKey` off the
    // mouseup that ends the selection.
    strikeOnRelease: {
      description: 'Strike through on release',
      bindings: ['Alt drag'],
      section: 'Annotations',
      hint: 'Hold Alt as you release a selection to mark it for deletion.',
      displayOrder: 4,
    },
  },
});
