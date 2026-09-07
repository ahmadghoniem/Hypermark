import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const hasDom = typeof document !== 'undefined';
const toolbarModule = hasDom ? await import('./AnnotationToolbar') : null;
const AnnotationToolbar = toolbarModule?.AnnotationToolbar as typeof import('./AnnotationToolbar')['AnnotationToolbar'];

let host: HTMLElement | null = null;
let root: Root | null = null;
let originalMatchMedia: typeof window.matchMedia | undefined;

function finePointerMatchMedia(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
}

beforeEach(() => {
  if (!hasDom) return;
  originalMatchMedia = window.matchMedia;
  window.matchMedia = finePointerMatchMedia;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  if (hasDom) {
    document.body.replaceChildren();
    if (originalMatchMedia) window.matchMedia = originalMatchMedia;
  }
});

async function mountToolbar(positionLeft: number): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const toolbarRef = React.createRef<HTMLDivElement>();

  await act(async () => {
    root?.render(
      <AnnotationToolbar
        toolbarState={{
          position: { top: 100, left: positionLeft },
          range: { start: 6, end: 6, side: 'additions' },
        }}
        toolbarRef={toolbarRef}
        commentText=""
        setCommentText={() => {}}
        suggestedCode=""
        setSuggestedCode={() => {}}
        showSuggestedCode={false}
        setShowSuggestedCode={() => {}}
        setShowCodeModal={() => {}}
        setShowCommentModal={() => {}}
        onSubmit={() => {}}
        onDismiss={() => {}}
        onCancel={() => {}}
        conventionalCommentsEnabled={false}
        conventionalLabel={null}
        onConventionalLabelChange={() => {}}
        decorations={[]}
        onDecorationsChange={() => {}}
        images={[]}
        pendingAttachments={[]}
        onAddImage={() => {}}
        onRemoveImage={() => {}}
        onRemovePendingAttachment={() => {}}
        onRetryPendingAttachment={() => {}}
        onAttachFiles={() => {}}
      />,
    );
  });

  const toolbar = document.querySelector<HTMLElement>('.review-toolbar');
  if (!toolbar) throw new Error('review annotation toolbar did not render');
  return toolbar;
}

function toolbarHorizontalEdges(toolbar: HTMLElement): { left: number; right: number } {
  const width = Number.parseFloat(toolbar.style.width);
  const center = Number.parseFloat(toolbar.style.left);
  return { left: center - width / 2, right: center + width / 2 };
}

describe('Comment toolbar placement', () => {
  test.skipIf(!hasDom)('keeps the full toolbar inside the left viewport edge', async () => {
    const toolbar = await mountToolbar(0);
    expect(toolbarHorizontalEdges(toolbar).left).toBeGreaterThanOrEqual(0);
  });

  test.skipIf(!hasDom)('keeps the full toolbar inside the right viewport edge', async () => {
    const toolbar = await mountToolbar(window.innerWidth);
    expect(toolbarHorizontalEdges(toolbar).right).toBeLessThanOrEqual(window.innerWidth);
  });
});
