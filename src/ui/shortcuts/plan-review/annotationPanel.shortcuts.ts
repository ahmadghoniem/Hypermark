import { defineShortcutScope } from '../core';

export const annotationPanelShortcuts = defineShortcutScope({
  id: 'annotation-panel',
  title: 'Annotation Panel',
  shortcuts: {
    saveEdit: {
      description: 'Save annotation edit',
      bindings: ['Mod+Enter'],
      section: 'Annotations',
      hint: 'Available while editing an annotation in the side panel.',
      displayOrder: 50,
    },
    cancelEdit: {
      description: 'Cancel annotation edit',
      bindings: ['Escape'],
      section: 'Annotations',
      hint: 'Available while editing an annotation in the side panel.',
      displayOrder: 60,
    },
  },
});
