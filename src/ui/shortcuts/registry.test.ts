import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as shortcuts from './index';
import type { ShortcutScopeDefinition } from './core';

/**
 * Allowlist for shortcuts whose handlers are wired directly by keydown listeners
 * rather than via a `use*Shortcuts({ handlers: { ... } })` hook registration.
 *
 * (Every shortcut action ID in shortcuts/index.ts must either
 * appear in a `handlers` object under packages/{editor,review-editor,ui} or in
 * this HAND_WIRED allowlist pointing to its implementing file on disk.)
 */
export const HAND_WIRED: Record<string, string> = {
  // review-file-tree (FileTree.tsx:197–210)
  'review-file-tree.nextFile': 'src/review/components/FileTree.tsx',
  'review-file-tree.prevFile': 'src/review/components/FileTree.tsx',
  'review-file-tree.firstFile': 'src/review/components/FileTree.tsx',
  'review-file-tree.lastFile': 'src/review/components/FileTree.tsx',

  // review-all-files-diff (AllFilesCodeView.tsx:1707–1760)
  'review-all-files-diff.toggleCollapse': 'src/review/components/AllFilesCodeView.tsx',
  'review-all-files-diff.undoCollapse': 'src/review/components/AllFilesCodeView.tsx',
  'review-all-files-diff.addFileComment': 'src/review/components/AllFilesCodeView.tsx',
  'review-all-files-diff.nextFile': 'src/review/components/AllFilesCodeView.tsx',
  'review-all-files-diff.prevFile': 'src/review/components/AllFilesCodeView.tsx',

  // review-annotation-toolbar (the review line composer is CommentPopover)
  'review-annotation-toolbar.submitComment': 'src/ui/components/CommentPopover.tsx',
  'review-annotation-toolbar.cancel': 'src/ui/components/CommentPopover.tsx',

  // review-chrome (App.tsx: keydown handlers from CHROME constants)
  'review-chrome.searchFiles': 'src/review/App.tsx',
  'review-chrome.nextSearchMatch': 'src/review/App.tsx',
  'review-chrome.copyFeedback': 'src/review/App.tsx',
  'review-chrome.toggleFileTree': 'src/review/App.tsx',
  'review-chrome.toggleSidebar': 'src/review/App.tsx',
  'review-chrome.dismiss': 'src/review/App.tsx',

  // annotation-panel (AnnotationPanel.tsx:540–546)
  'annotation-panel.saveEdit': 'src/ui/components/AnnotationPanel.tsx',
  'annotation-panel.cancelEdit': 'src/ui/components/AnnotationPanel.tsx',

  // annotation-toolbar (AnnotationToolbar.tsx)
  'annotation-toolbar.typeToComment': 'src/ui/components/AnnotationToolbar.tsx',
  'annotation-toolbar.close': 'src/ui/components/AnnotationToolbar.tsx',

  // viewer (Viewer.tsx)
  'viewer.copySelection': 'src/ui/components/Viewer.tsx',
  'viewer.closeLightbox': 'src/ui/components/Viewer.tsx',

  // comment-popover (CommentPopover.tsx)
  'comment-popover.submit': 'src/ui/components/CommentPopover.tsx',
  'comment-popover.cancel': 'src/ui/components/CommentPopover.tsx',

  // decision-control (DecisionControl.tsx)
  'decision-control.submitNote': 'src/ui/components/DecisionControl.tsx',
  'decision-control.closeNote': 'src/ui/components/DecisionControl.tsx',

  // annotation-mode Alt+drag (useAnnotationHighlighter.ts)
  'annotation-mode.strikeOnRelease': 'src/ui/hooks/useAnnotationHighlighter.ts',
};

function getRepoRoot(): string {
  let dir = __dirname;
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) || fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return path.resolve(__dirname, '../../..');
}

function findHandlerKeysInCode(code: string): Set<string> {
  const keys = new Set<string>();
  const regex = /handlers\s*:\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < code.length && depth > 0) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') depth--;
      i++;
    }
    const block = code.slice(start, i - 1);
    const lines = block.split('\n');
    for (const line of lines) {
      const keyMatch = line.match(/^\s*([a-zA-Z0-9_]+)\s*:/);
      if (keyMatch) {
        const k = keyMatch[1];
        if (!['when', 'handle', 'target', 'scope'].includes(k)) {
          keys.add(k);
        }
      }
    }
  }

  return keys;
}

function collectAllHandlerKeys(repoRoot: string): Set<string> {
  const handlerKeys = new Set<string>();
  const targetDirs = ['src/annotate', 'src/review', 'src/ui'];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        walk(fullPath);
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.test.tsx')
      ) {
        const code = fs.readFileSync(fullPath, 'utf8');
        const found = findHandlerKeysInCode(code);
        for (const k of found) handlerKeys.add(k);
      }
    }
  }

  for (const d of targetDirs) {
    walk(path.join(repoRoot, d));
  }

  return handlerKeys;
}

function getAllScopes(): ShortcutScopeDefinition<any>[] {
  const scopes: ShortcutScopeDefinition<any>[] = [];
  for (const value of Object.values(shortcuts)) {
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as any).id === 'string' &&
      typeof (value as any).shortcuts === 'object' &&
      (value as any).shortcuts !== null
    ) {
      scopes.push(value as ShortcutScopeDefinition<any>);
    }
  }
  return scopes;
}

describe('shortcut registry handlers check', () => {
  const repoRoot = getRepoRoot();

  it('every hand-wired file exists on disk', () => {
    for (const [key, relPath] of Object.entries(HAND_WIRED)) {
      const fullPath = path.resolve(repoRoot, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it('every action id in every scope appears either in handlers or HAND_WIRED', () => {
    const scopes = getAllScopes();
    expect(scopes.length).toBeGreaterThan(0);

    const handlerKeys = collectAllHandlerKeys(repoRoot);
    const unhandled: string[] = [];

    for (const scope of scopes) {
      for (const actionId of Object.keys(scope.shortcuts)) {
        const scopedKey = `${scope.id}.${actionId}`;
        const hasHandler = handlerKeys.has(actionId);
        const hasHandWired = scopedKey in HAND_WIRED || actionId in HAND_WIRED;

        if (!hasHandler && !hasHandWired) {
          unhandled.push(scopedKey);
        }
      }
    }

    expect(unhandled).toEqual([]);
  });
});
