import { defineShortcutScope } from '../core';

export const annotationToolbarShortcuts = defineShortcutScope({
  id: 'annotation-toolbar',
  title: 'Annotation Toolbar',
  shortcuts: {
    typeToComment: {
      description: 'Start comment',
      bindings: ['A-Z'],
      section: 'Annotations',
      hint: 'Typing a letter opens the comment editor with that character.',
      displayOrder: 10,
    },
    close: {
      description: 'Close toolbar',
      bindings: ['Escape'],
      section: 'Annotations',
      hint: 'Available while the annotation toolbar is open.',
      displayOrder: 40,
    },
  },
});
