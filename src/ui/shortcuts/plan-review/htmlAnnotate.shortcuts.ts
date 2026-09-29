import { defineShortcutScope } from '../core';
import { createShortcutScopeHook } from '../runtime';

// Interact/Annotate toggle for HTML annotate surfaces. The same chord is
// mirrored inside the sandboxed iframe by the bridge and forwarded to the
// parent, so it works
// regardless of which document owns the keyboard. No bare-letter binding:
// bare letters belong to type-to-comment and the page itself.
export const htmlAnnotateShortcuts = defineShortcutScope({
  id: 'html-annotate',
  title: 'HTML Annotate',
  shortcuts: {
    toggleAnnotateMode: {
      description: 'Toggle Interact / Annotate',
      bindings: ['Mod+Shift+A'],
      section: 'Annotations',
      hint: 'On HTML surfaces: arm annotation capture, or hand clicks back to the page. Esc also exits Annotate.',
      preventDefault: true,
      displayOrder: 0,
    },
  },
});

export const useHtmlAnnotateShortcuts = createShortcutScopeHook(htmlAnnotateShortcuts);
