import { defineShortcutScope } from '../core';

/**
 * The review app's own chrome keys: search, panels, and the two file/feedback
 * actions that belong to no narrower scope.
 *
 * These were the last shortcuts the registry did not know about. Their
 * handlers live in `review-editor/App.tsx` as ordinary `keydown` effects with
 * guards too situational to express as a scope `when` (search focus), so
 * they are NOT dispatched
 * through `useShortcutScope`. What they do read from here is the BINDING — via
 * `matchesShortcutBinding(event, ...bindings)` — so this file is the single
 * place a review chrome key is written down, for the help panel and the
 * handler alike.
 *
 * `Escape` closes the file search, or clears its query first when one is set.
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
      description: 'Clear or close search',
      bindings: ['Escape'],
      section: 'Actions',
      hint: 'Clears the search query, then closes the search field.',
      displayOrder: 60,
    },
  },
});
