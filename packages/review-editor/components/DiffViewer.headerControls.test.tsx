/**
 * The control-visibility preference (#1277) must gate the per-file diff
 * header too: a reviewer who turned the Viewed controls off in the Tree
 * controls popover should not see them anywhere. Guards the flag threading
 * DiffViewer -> FileHeader (the flag hides its button, and a visible button
 * still fires its handler). The V shortcut bypasses the button by design and
 * is not exercised here.
 *
 * DOM-gated (DOM_TESTS=1) and registered in .github/workflows/test.yml's
 * "Run diff-renderer DOM tests" step.
 */
import { afterEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const realResolveSyntaxTheme = (await import('@hypermark/ui/utils/syntaxTheme')).resolveSyntaxTheme;

mock.module('../workerPool', () => ({
  useIsWorkerPoolReadyOrDisabled: () => true,
  useWorkerPoolThemeSync: () => {},
}));

mock.module('../hooks/usePierreTheme', () => ({
  buildLineBgOverrides: () => '',
  resolveSyntaxTheme: realResolveSyntaxTheme,
  usePierreTheme: () => ({ type: 'light', css: '' }),
}));

mock.module('./ToolbarHost', () => ({
  ToolbarHost: React.forwardRef(function MockToolbarHost() {
    return null;
  }),
}));

const { DiffViewer } = await import('./DiffViewer');

const hasDom = typeof document !== 'undefined';

const TEXT_PATCH = [
  'diff --git a/calc.ts b/calc.ts',
  'index 0000000..1111111 100644',
  '--- a/calc.ts',
  '+++ b/calc.ts',
  '@@ -1,3 +1,3 @@',
  ' const a = 1;',
  '-const b = 1;',
  '+const b = 2;',
  ' const c = 3;',
  '',
].join('\n');

const VIEWED_BUTTON = 'button[title*="viewed (V)"]';

describe.if(hasDom)('header control visibility (DOM)', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  const originalFetch = globalThis.fetch;

  async function render(node: React.ReactElement) {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ oldContent: null, newContent: null }), {
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(node);
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    return host;
  }

  afterEach(async () => {
    if (root) {
      await act(async () => root!.unmount());
      root = null;
    }
    host?.remove();
    host = null;
    globalThis.fetch = originalFetch;
  });

  function view(
    props: Partial<React.ComponentProps<typeof DiffViewer>>,
    onToggleViewed: () => void,
  ) {
    return (
      <DiffViewer
        patch={TEXT_PATCH}
        filePath="calc.ts"
        diffStyle="unified"
        annotations={[]}
        selectedAnnotationId={null}
        scrollTargetAnnotation={null}
        pendingSelection={null}
        onLineSelection={() => {}}
        onAddAnnotation={() => {}}
        onAddFileComment={() => {}}
        onEditAnnotation={() => {}}
        onSelectAnnotation={() => {}}
        onDeleteAnnotation={() => {}}
        onToggleViewed={onToggleViewed}
        {...props}
      />
    );
  }

  test('the Viewed header button renders by default and fires its handler', async () => {
    let toggled = 0;
    const el = await render(view({}, () => toggled++));
    const viewedBtn = el.querySelector<HTMLButtonElement>(VIEWED_BUTTON);
    expect(viewedBtn).not.toBeNull();
    await act(async () => viewedBtn!.click());
    expect(toggled).toBe(1);
  });

  test('showViewedControls={false} hides the Viewed button', async () => {
    const el = await render(view({ showViewedControls: false }, () => {}));
    expect(el.querySelector(VIEWED_BUTTON)).toBeNull();
  });

});
