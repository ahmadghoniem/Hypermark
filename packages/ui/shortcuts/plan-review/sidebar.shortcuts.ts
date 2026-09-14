import { defineShortcutScope } from '../core';
import { createShortcutScopeHook } from '../runtime';

export const annotateSidebarShortcuts = defineShortcutScope({
  id: 'annotate-sidebar',
  title: 'Annotate Sidebar',
  shortcuts: {
    toggleContents: {
      description: 'Toggle Contents sidebar',
      bindings: ['Mod+B'],
      section: 'Sidebar',
      displayOrder: 10,
      preventDefault: true,
    },
  },
});

export const useAnnotateSidebarShortcuts = createShortcutScopeHook(annotateSidebarShortcuts);
