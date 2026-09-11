import { defineShortcutScope } from '../core';

/**
 * The review app's own chrome keys: search, panels, and the two file/feedback
 * actions that belong to no narrower scope.
 *
 * These were the last shortcuts the registry did not know about. Their
 * handlers live in `review-editor/App.tsx` as ordinary `keydown` effects with
 * guards too situational to express as a scope `when` (search focus, compact
 * navigator state, an Escape ladder with six rungs), so they are NOT dispatched
 * through `useShortcutScope`. What they do read from here is the BINDING — via
 * `matchesShortcutBinding(event, ...bindings)` — so this file is the single
 * place a review chrome key is written down, for the help panel and the
 * handler alike.
 *
 * `Escape` is declared as one action deliberately. The handler walks a
 * precedence ladder (destination menu, export modal, compact navigator,
 * compact sidebar, then search), but to a reader there is one Escape key and
 * it dismisses whatever is in front of them.
 */
export const reviewChromeShortcuts = defineShortcutScope({
  id: 'review-chrome',
  title: 'Review',
  shortcuts: {
    searchFiles: {
      description: 'Search files',
      bindings: ['Mod+F'],
      section: 'Actions',
      hint: 'Opens the file list and focuses its search. Pressing it again reselects the current query.',
      displayOrder: 10,
      preventDefault: true,
    },
    nextSearchMatch: {
      description: 'Next / previous search match',
      bindings: ['Enter', 'F3'],
      section: 'Actions',
      hint: 'Shift steps backwards.',
      displayOrder: 20,
      preventDefault: true,
    },
    copyFeedback: {
      description: 'Copy feedback',
      bindings: ['Mod+Shift+Y'],
      section: 'Actions',
      hint: 'Copies the same feedback that gets submitted.',
      displayOrder: 30,
      preventDefault: true,
    },
    toggleFileTree: {
      description: 'Toggle file tree',
      bindings: ['Mod+B'],
      section: 'Actions',
      displayOrder: 40,
      preventDefault: true,
    },
    toggleSidebar: {
      description: 'Toggle sidebar',
      bindings: ['Mod+.'],
      section: 'Actions',
      displayOrder: 50,
      preventDefault: true,
    },
    dismiss: {
      description: 'Close menu / clear search',
      bindings: ['Escape'],
      section: 'Actions',
      hint: 'Dismisses whatever is in front: an open menu, the compact navigator, the sidebar, then the search query.',
      displayOrder: 60,
    },
    toggleViewed: {
      description: 'Toggle viewed',
      bindings: ['V'],
      section: 'File Actions',
      hint: 'Marks the focused file viewed. In all-files view it also collapses the file.',
      displayOrder: 10,
      preventDefault: true,
    },
  },
});
