import { defineShortcutScope } from '../core';

export const reviewAnnotationToolbarShortcuts = defineShortcutScope({
  id: 'review-annotation-toolbar',
  title: 'Review Annotation Toolbar',
  shortcuts: {
    submitComment: {
      description: 'Submit comment',
      bindings: ['Mod+Enter'],
      section: 'Annotations',
      displayOrder: 10,
    },
    cancel: {
      description: 'Close comment editor',
      bindings: ['Escape'],
      section: 'Annotations',
      hint: 'Available while the review comment editor is open.',
      displayOrder: 30,
    },
  },
});
