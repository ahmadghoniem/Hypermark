import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as shortcuts from './index';
import type { ShortcutScopeDefinition } from './core';

/**
 * Allowlist for shortcuts whose handlers are wired directly by keydown listeners
 * rather than via a `use*Shortcuts({ handlers: { ... } })` hook registration.
 *
 * (Spec 09: A7 requires every shortcut action ID in shortcuts/index.ts to either
 * appear in a `handlers` object under packages/{editor,review-editor,ui} or in
 * this HAND_WIRED allowlist pointing to its implementing file on disk.)
 */
export const HAND_WIRED: Record<string, string> = {
  // review-file-tree (FileTree.tsx:197–210)
  'review-file-tree.nextFile': 'packages/review-editor/components/FileTree.tsx',
  'review-file-tree.prevFile': 'packages/review-editor/components/FileTree.tsx',
  'review-file-tree.firstFile': 'packages/review-editor/components/FileTree.tsx',
  'review-file-tree.lastFile': 'packages/review-editor/components/FileTree.tsx',

  // review-all-files-diff (AllFilesCodeView.tsx:1707–1760)
  'review-all-files-diff.toggleCollapse': 'packages/review-editor/components/AllFilesCodeView.tsx',
  'review-all-files-diff.undoCollapse': 'packages/review-editor/components/AllFilesCodeView.tsx',
  'review-all-files-diff.addFileComment': 'packages/review-editor/components/AllFilesCodeView.tsx',
  'review-all-files-diff.nextFile': 'packages/review-editor/components/AllFilesCodeView.tsx',
  'review-all-files-diff.prevFile': 'packages/review-editor/components/AllFilesCodeView.tsx',

  // review-annotation-toolbar (the review line composer is CommentPopover)
  'review-annotation-toolbar.submitComment': 'packages/ui/components/CommentPopover.tsx',
  'review-annotation-toolbar.cancel': 'packages/ui/components/CommentPopover.tsx',

  // review-chrome (App.tsx: keydown handlers from CHROME constants)
  'review-chrome.searchFiles': 'packages/review-editor/App.tsx',
  'review-chrome.nextSearchMatch': 'packages/review-editor/App.tsx',
  'review-chrome.copyFeedback': 'packages/review-editor/App.tsx',
  'review-chrome.toggleFileTree': 'packages/review-editor/App.tsx',
  'review-chrome.toggleSidebar': 'packages/review-editor/App.tsx',
  'review-chrome.dismiss': 'packages/review-editor/App.tsx',

  // annotation-panel (AnnotationPanel.tsx:540–546)
  'annotation-panel.saveEdit': 'packages/ui/components/AnnotationPanel.tsx',
  'annotation-panel.cancelEdit': 'packages/ui/components/AnnotationPanel.tsx',

  // annotation-toolbar (AnnotationToolbar.tsx)
  'annotation-toolbar.typeToComment': 'packages/ui/components/AnnotationToolbar.tsx',
  'annotation-toolbar.close': 'packages/ui/components/AnnotationToolbar.tsx',

  // viewer (Viewer.tsx)
  'viewer.copySelection': 'packages/ui/components/Viewer.tsx',
  'viewer.closeLightbox': 'packages/ui/components/Viewer.tsx',

  // comment-popover (CommentPopover.tsx)
  'comment-popover.submit': 'packages/ui/components/CommentPopover.tsx',
  'comment-popover.cancel': 'packages/ui/components/CommentPopover.tsx',
  'comment-popover.skillMenuOpen': 'packages/ui/components/CommentPopover.tsx',

  // decision-control (DecisionControl.tsx)
  'decision-control.submitNote': 'packages/ui/components/DecisionControl.tsx',
  'decision-control.closeNote': 'packages/ui/components/DecisionControl.tsx',

  // input-method (useInputMethodSwitch.ts)
  'input-method.temporarySwitch': 'packages/ui/hooks/useInputMethodSwitch.ts',
  'input-method.toggleSwitch': 'packages/ui/hooks/useInputMethodSwitch.ts',
};

function getRepoRoot(): string {
  let dir = __dirname;
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) || fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'packages'))) {
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
  const targetDirs = ['packages/editor', 'packages/review-editor', 'packages/ui'];

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

describe('shortcut registry handlers check (spec 09: A7)', () => {
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
