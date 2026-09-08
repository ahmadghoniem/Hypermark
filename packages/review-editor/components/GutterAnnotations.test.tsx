/**
 * Spec 05 §3.1 — the gutter marker and its popup, tested in isolation from the
 * diff renderers that host them.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DiffAnnotationMetadata } from '@hypermark/ui/types';
import {
  GutterAnnotationMarker,
  GutterAnnotationPopup,
  groupAnchors,
  useGutterAnnotations,
  type GutterAnchor,
} from './GutterAnnotations';

const hasDom = typeof document !== 'undefined';

let root: Root | null = null;
let host: HTMLElement | null = null;

function metadata(id: string, text: string, extra: Partial<DiffAnnotationMetadata> = {}): DiffAnnotationMetadata {
  return { annotationId: id, type: 'comment', text, ...extra } as DiffAnnotationMetadata;
}

interface HarnessProps {
  anchor: GutterAnchor;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSelect?: (id: string) => void;
}

/** Mirrors how a diff renderer hosts the marker and the popup together. */
const Harness: React.FC<HarnessProps> = ({ anchor, onEdit = () => {}, onDelete = () => {}, onSelect = () => {} }) => {
  const controller = useGutterAnnotations();
  const open = controller.state?.anchorKey === anchor.key;
  return (
    <div>
      <GutterAnnotationMarker
        anchor={anchor}
        controller={controller}
        isOpen={open}
        isSelected={false}
      />
      {open && controller.state && (
        <GutterAnnotationPopup
          anchor={anchor}
          state={controller.state}
          controller={controller}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
};

async function mount(props: HarnessProps): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Harness {...props} />);
  });
}

function marker(): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>('[data-gutter-marker]');
  if (!el) throw new Error('no gutter marker');
  return el;
}

function popup(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-gutter-popup]');
}

function entries(): HTMLElement[] {
  return Array.from(popup()?.querySelectorAll<HTMLElement>('[data-gutter-entry]') ?? []);
}

/**
 * React synthesizes pointerenter/pointerleave from the bubbling
 * pointerover/pointerout pair, so the tests dispatch what a browser dispatches.
 */
async function fire(el: Element, type: string, init: EventInit = {}): Promise<void> {
  const native = type === 'pointerenter' ? 'pointerover' : type === 'pointerleave' ? 'pointerout' : type;
  await act(async () => {
    el.dispatchEvent(new Event(native, { bubbles: true, ...init }));
  });
}

const singleAnchor: GutterAnchor = {
  key: 'src/app.ts:additions:12',
  side: 'additions',
  lineNumber: 12,
  annotations: [metadata('a1', 'this allocation is hot')],
};

const overlappingAnchor: GutterAnchor = {
  key: 'src/app.ts:additions:12',
  side: 'additions',
  lineNumber: 12,
  annotations: [
    metadata('a1', 'this allocation is hot'),
    metadata('a2', 'and the retry loop never backs off'),
  ],
};

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  document.body.textContent = '';
});

describe.if(hasDom)('Spec 05 §3.1 — gutter marker and popup', () => {
  test('the marker occupies zero layout height', async () => {
    await mount({ anchor: singleAnchor });
    const row = document.querySelector<HTMLElement>('[data-gutter-marker-row]')!;
    expect(row.style.height).toBe('0px');
    expect(marker().style.position).toBe('absolute');
  });

  test('hover opens a read-only preview; the actions appear only once pinned', async () => {
    await mount({ anchor: singleAnchor });

    await fire(marker(), 'pointerenter');
    expect(popup()).not.toBeNull();
    expect(popup()!.dataset.pinned).toBe('false');
    expect(popup()!.textContent).toContain('this allocation is hot');
    expect(popup()!.querySelector('button')).toBeNull();

    await act(async () => marker().click());
    expect(popup()!.dataset.pinned).toBe('true');
    const editButtons = Array.from(popup()!.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Edit',
    );
    expect(editButtons).toHaveLength(1);
  });

  test('Enter and Space pin the popup', async () => {
    for (const key of ['Enter', ' ']) {
      await mount({ anchor: singleAnchor });
      await act(async () => {
        marker().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
      expect(popup()?.dataset.pinned).toBe('true');
      if (root) await act(async () => root?.unmount());
      root = null;
      host?.remove();
      document.body.textContent = '';
    }
  });

  test('a pinned popup survives pointer leave; a preview does not', async () => {
    await mount({ anchor: singleAnchor });

    await fire(marker(), 'pointerenter');
    await fire(marker(), 'pointerleave');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(popup()).toBeNull();

    await act(async () => marker().click());
    await fire(marker(), 'pointerleave');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(popup()).not.toBeNull();
  });

  test('every overlapping annotation is listed with its own text, with no "N of M" counter', async () => {
    await mount({ anchor: overlappingAnchor });
    await act(async () => marker().click());

    expect(entries()).toHaveLength(2);
    expect(entries()[0].textContent).toContain('this allocation is hot');
    expect(entries()[1].textContent).toContain('and the retry loop never backs off');
    expect(popup()!.textContent).not.toContain('1 of 2');
    expect(popup()!.textContent).not.toContain('of 2');
  });

  test('Escape closes the popup and returns focus to the marker', async () => {
    await mount({ anchor: singleAnchor });
    await act(async () => marker().click());
    expect(popup()).not.toBeNull();

    await act(async () => {
      popup()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(popup()).toBeNull();
    expect(document.activeElement).toBe(marker());
  });

  test('Edit reports the annotation the reviewer chose', async () => {
    const edited: string[] = [];
    await mount({ anchor: overlappingAnchor, onEdit: (id) => edited.push(id) });
    await act(async () => marker().click());

    const secondEdit = Array.from(entries()[1].querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Edit',
    )!;
    await act(async () => secondEdit.click());

    expect(edited).toEqual(['a2']);
  });

  test('the popup shows no author, timestamp, or ordinal chrome', async () => {
    const anchor: GutterAnchor = {
      ...singleAnchor,
      annotations: [
        metadata('a1', 'body text', {
          author: 'ada',
          createdAt: Date.now() - 60_000,
          reviewProfileLabel: 'security',
        }),
      ],
    };
    await mount({ anchor });
    await act(async () => marker().click());

    const text = popup()!.textContent ?? '';
    expect(text).toContain('body text');
    expect(text).not.toContain('ada');
    expect(text).not.toContain('ago');
    expect(text).not.toContain('security');
  });

  test('groupAnchors collects overlapping annotations into one ordered anchor', async () => {
    const anchors = groupAnchors(
      [
        { side: 'additions', lineNumber: 3, metadata: metadata('a1', 'first') },
        { side: 'additions', lineNumber: 3, metadata: metadata('a2', 'second') },
        { side: 'deletions', lineNumber: 3, metadata: metadata('a3', 'other side') },
        { side: 'additions', lineNumber: 4, metadata: undefined },
      ],
      'src/app.ts:',
    );

    expect([...anchors.keys()]).toEqual(['src/app.ts:additions:3', 'src/app.ts:deletions:3']);
    expect(anchors.get('src/app.ts:additions:3')!.annotations.map((a) => a.annotationId)).toEqual([
      'a1',
      'a2',
    ]);
  });
});
