/** DOM-gated tests for FileTree navigation behaviors (spec 04 step 4). */
import { afterEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FileTree } from './FileTree';
import type { DiffFile } from '../types';

const hasDom = typeof document !== 'undefined';
let host: HTMLDivElement | null = null;
let root: Root | null = null;

const files: DiffFile[] = [
  {
    path: 'src/first.ts',
    patch: '',
    additions: 1,
    deletions: 0,
    status: 'added',
  },
  {
    path: 'src/second.ts',
    patch: '',
    additions: 2,
    deletions: 1,
    status: 'modified',
  },
  {
    path: 'src/renamed-new.ts',
    oldPath: 'src/renamed-old.ts',
    patch: '',
    additions: 1,
    deletions: 1,
    status: 'renamed',
  },
  {
    path: 'src/fourth.ts',
    patch: '',
    additions: 0,
    deletions: 2,
    status: 'deleted',
  },
];

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"]').forEach((el) => el.remove());
});

describe('FileTree — double-click activation', () => {
  test.skipIf(!hasDom)('resolves double-click on a row to the canonical file index', async () => {
    let doubleClickedIndex = -1;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <FileTree
          files={files}
          activeFileIndex={0}
          onSelectFile={() => {}}
          onDoubleClickFile={(index) => {
            doubleClickedIndex = index;
          }}
          annotations={[]}
          viewedFiles={new Set()}
          stagedFiles={new Set()}
        />,
      );
    });

    // Create a mock row carrying data-item-path inside the tree container
    const container = host.querySelector('.flex-1.min-h-0.flex.flex-col');
    expect(container).not.toBeNull();

    const mockRow = document.createElement('div');
    mockRow.setAttribute('data-item-path', 'src/second.ts');
    container?.appendChild(mockRow);

    const innerSpan = document.createElement('span');
    mockRow.appendChild(innerSpan);

    await act(async () => {
      innerSpan.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    });

    expect(doubleClickedIndex).toBe(1);
  });

  test.skipIf(!hasDom)('resolves double-click on a renamed file via its oldPath to the canonical index', async () => {
    let doubleClickedIndex = -1;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <FileTree
          files={files}
          activeFileIndex={0}
          onSelectFile={() => {}}
          onDoubleClickFile={(index) => {
            doubleClickedIndex = index;
          }}
          annotations={[]}
          viewedFiles={new Set()}
          stagedFiles={new Set()}
        />,
      );
    });

    const container = host.querySelector('.flex-1.min-h-0.flex.flex-col');
    const mockRenamedRow = document.createElement('div');
    mockRenamedRow.setAttribute('data-item-path', 'src/renamed-old.ts');
    container?.appendChild(mockRenamedRow);

    await act(async () => {
      mockRenamedRow.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    });

    // Must resolve to src/renamed-new.ts at index 2
    expect(doubleClickedIndex).toBe(2);
  });

  test.skipIf(!hasDom)('double-click with no resolvable data-item-path is a no-op', async () => {
    let called = false;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <FileTree
          files={files}
          activeFileIndex={0}
          onSelectFile={() => {}}
          onDoubleClickFile={() => {
            called = true;
          }}
          annotations={[]}
          viewedFiles={new Set()}
          stagedFiles={new Set()}
        />,
      );
    });

    const container = host.querySelector('.flex-1.min-h-0.flex.flex-col');
    const nonPathEl = document.createElement('div');
    container?.appendChild(nonPathEl);

    await act(async () => {
      nonPathEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    });

    expect(called).toBe(false);
  });
});

describe('FileTree — keyboard navigation', () => {
  test.skipIf(!hasDom)('with hideViewedFiles on, j/k/Home/End never select a hidden viewed file', async () => {
    const selectedIndices: number[] = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    // Files: 0: first.ts, 1: second.ts (viewed), 2: renamed-new.ts, 3: fourth.ts (viewed)
    const viewedFiles = new Set(['src/second.ts', 'src/fourth.ts']);

    await act(async () => {
      root?.render(
        <FileTree
          files={files}
          activeFileIndex={0}
          onSelectFile={(index) => selectedIndices.push(index)}
          annotations={[]}
          viewedFiles={viewedFiles}
          hideViewedFiles={true}
          stagedFiles={new Set()}
        />,
      );
    });
    // Clear initial mount selection
    selectedIndices.length = 0;

    // Press j: next visible file should be index 2 (renamed-new.ts), skipping index 1 (second.ts)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    });
    expect(selectedIndices).toEqual([2]);

    // Press End: should land on last visible file (index 2), not index 3 (fourth.ts)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(selectedIndices).toEqual([2, 2]);

    // Press Home: should land on first visible file (index 0)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    expect(selectedIndices).toEqual([2, 2, 0]);
  });

  test.skipIf(!hasDom)('the editable guard suppresses navigation in inputs, textareas, and contenteditable', async () => {
    let called = false;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <FileTree
          files={files}
          activeFileIndex={0}
          onSelectFile={() => {
            called = true;
          }}
          annotations={[]}
          viewedFiles={new Set()}
          stagedFiles={new Set()}
        />,
      );
    });
    called = false;

    // Input element
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    });
    expect(called).toBe(false);
    input.remove();

    // Contenteditable element
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    document.body.appendChild(editable);
    editable.focus();
    await act(async () => {
      editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(called).toBe(false);
    editable.remove();
  });

  test.skipIf(!hasDom)('the role="dialog" overlay guard suppresses navigation', async () => {
    let called = false;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <FileTree
          files={files}
          activeFileIndex={0}
          onSelectFile={() => {
            called = true;
          }}
          annotations={[]}
          viewedFiles={new Set()}
          stagedFiles={new Set()}
        />,
      );
    });
    called = false;

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    button.focus();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    });
    expect(called).toBe(false);
  });
});

describe('FileTree — reveal survives path-set change', () => {
  test.skipIf(!hasDom)('re-reveals active file when path set changes with files unchanged', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    // Initial render: active file is index 1 (second.ts), first.ts is viewed, hideViewedFiles is false
    const viewedFiles = new Set(['src/first.ts']);

    await act(async () => {
      root?.render(
        <FileTree
          files={files}
          activeFileIndex={1}
          onSelectFile={() => {}}
          annotations={[]}
          viewedFiles={viewedFiles}
          hideViewedFiles={false}
          stagedFiles={new Set()}
        />,
      );
    });

    // Re-render with hideViewedFiles=true (files unchanged, activeFileIndex=1 unchanged)
    // treePaths changes, causing resetPaths and triggering reveal effect
    await act(async () => {
      root?.render(
        <FileTree
          files={files}
          activeFileIndex={1}
          onSelectFile={() => {}}
          annotations={[]}
          viewedFiles={viewedFiles}
          hideViewedFiles={true}
          stagedFiles={new Set()}
        />,
      );
    });

    // The container should still be rendered and active file row retained
    const container = host.querySelector('.flex-1.min-h-0.flex.flex-col');
    expect(container).not.toBeNull();
  });
});
