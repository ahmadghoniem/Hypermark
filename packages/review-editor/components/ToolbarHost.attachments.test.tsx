/**
 * Spec 05 §3.2/§4.1.5 — the code-review composer owns its attachments, same
 * as the document composer (`CommentPopover.attachmentRepro.test.tsx`).
 *
 * `ToolbarHost` owns `useAttachmentUploads` and forwards its state into
 * whichever of `AnnotationToolbar` / `ExpandedCommentDialog` is mounted, so
 * these tests exercise it directly rather than duplicating the toolbar's own
 * placement tests.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CodeAnnotation, ImageAttachment } from '@hypermark/ui/types';
import {
  setUploadTransport,
  resetUploadTransport,
  type UploadTransport,
  type UploadResult,
} from '@hypermark/ui/utils/upload';
import { ToolbarHost, type ToolbarHostHandle } from './ToolbarHost';

const hasDom = typeof document !== 'undefined';

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

interface AddCall {
  type: string;
  text?: string;
  suggestedCode?: string;
  originalCode?: string;
  images?: ImageAttachment[];
}

interface EditCall {
  id: string;
  text?: string;
  suggestedCode?: string;
  originalCode?: string;
  images?: ImageAttachment[];
}

async function mountToolbarHost(): Promise<{
  ref: React.RefObject<ToolbarHostHandle | null>;
  added: AddCall[];
  edited: EditCall[];
}> {
  const added: AddCall[] = [];
  const edited: EditCall[] = [];
  const ref = React.createRef<ToolbarHostHandle>();

  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      <ToolbarHost
        ref={ref}
        patch=""
        filePath="src/example.ts"
        isFocused
        onLineSelection={() => {}}
        onAddAnnotation={(type, text, suggestedCode, originalCode, _label, _decorations, _tokenMeta, images) => {
          added.push({ type, text, suggestedCode, originalCode, images });
        }}
        onEditAnnotation={(id, text, suggestedCode, originalCode, _label, _decorations, images) => {
          edited.push({ id, text, suggestedCode, originalCode, images });
        }}
      />,
    );
  });

  return { ref, added, edited };
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function toolbar(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.review-toolbar');
  if (!el) throw new Error('floating annotation toolbar did not render');
  return el;
}

function strip(): HTMLElement | null {
  return toolbar().querySelector<HTMLElement>('[data-attachment-strip]');
}

function thumbnails(): HTMLElement[] {
  return Array.from(strip()?.querySelectorAll<HTMLElement>('[role="listitem"]') ?? []);
}

function submitButton(): HTMLButtonElement {
  const btn = Array.from(toolbar().querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === 'Add Comment' || b.textContent?.trim() === 'Update',
  );
  if (!btn) throw new Error('submit button not found');
  return btn;
}

function imageFile(name: string): File {
  return new File(['image-bytes'], name, { type: 'image/png' });
}

function transferWith(file: File): DataTransfer {
  const data = new DataTransfer();
  data.items.add(file);
  return data;
}

async function pasteInto(target: HTMLElement, file: File): Promise<void> {
  await act(async () => {
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & {
      clipboardData: DataTransfer;
    };
    event.clipboardData = transferWith(file);
    target.dispatchEvent(event);
  });
  await flush();
}

function stubTransport(upload: UploadTransport['upload']): void {
  setUploadTransport({ upload });
}

afterEach(async () => {
  resetUploadTransport();
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  host?.remove();
  host = null;
  document.body.textContent = '';
  if (hasDom && originalMatchMedia) window.matchMedia = originalMatchMedia;
});

function useFinePointer(): void {
  originalMatchMedia = window.matchMedia;
  window.matchMedia = finePointerMatchMedia;
}

describe.if(hasDom)('Spec 05 §3.2 — code review composer attachments', () => {
  test('an image pasted into the floating toolbar uploads, appears in the strip, and allows image-only submit', async () => {
    useFinePointer();
    stubTransport(async (file): Promise<UploadResult> => ({ path: `/uploads/${file.name}`, originalName: file.name }));
    const { ref, added } = await mountToolbarHost();

    await act(async () => {
      ref.current?.openLineAnnotation({ start: 10, end: 10, side: 'additions' });
    });
    await flush();

    const textarea = toolbar().querySelector('textarea')!;
    await pasteInto(textarea, imageFile('mockup.png'));

    expect(thumbnails()).toHaveLength(1);
    expect(toolbar().querySelector('button[aria-label="Remove mockup"]')).not.toBeNull();

    const submit = submitButton();
    expect(submit.hasAttribute('disabled')).toBe(false);
    await act(async () => submit.click());

    expect(added).toHaveLength(1);
    expect(added[0].text).toBeUndefined();
    expect(added[0].images).toEqual([{ path: '/uploads/mockup.png', name: 'mockup' }]);
  });

  test('an image dropped on the composer body attaches to the draft', async () => {
    useFinePointer();
    stubTransport(async (file) => ({ path: `/uploads/${file.name}` }));
    const { ref } = await mountToolbarHost();

    await act(async () => {
      ref.current?.openLineAnnotation({ start: 3, end: 3, side: 'additions' });
    });
    await flush();

    const textareaBlock = toolbar().querySelector('textarea')!.parentElement!;
    await act(async () => {
      const event = new Event('drop', { bubbles: true, cancelable: true }) as Event & {
        dataTransfer: DataTransfer;
      };
      event.dataTransfer = transferWith(imageFile('dropped.png'));
      textareaBlock.dispatchEvent(event);
    });
    await flush();

    expect(thumbnails()).toHaveLength(1);
    expect(toolbar().querySelector('button[aria-label="Remove dropped"]')).not.toBeNull();
  });

  test('a failed upload keeps the typed text and the attachment, and Retry re-sends it', async () => {
    useFinePointer();
    let attempts = 0;
    stubTransport(async (file) => {
      attempts += 1;
      if (attempts === 1) throw new Error('network down');
      return { path: `/uploads/${file.name}` };
    });
    const { ref } = await mountToolbarHost();

    await act(async () => {
      ref.current?.openLineAnnotation({ start: 5, end: 5, side: 'additions' });
    });
    await flush();

    const textarea = toolbar().querySelector('textarea') as HTMLTextAreaElement;
    // React controlled input: go through the native value setter so the
    // synthetic onChange fires with the new value.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, 'please look at this');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await pasteInto(textarea, imageFile('flaky.png'));

    expect(toolbar().querySelector('[data-attachment-status="error"]')).not.toBeNull();
    expect((toolbar().querySelector('textarea') as HTMLTextAreaElement).value).toBe('please look at this');

    const retry = toolbar().querySelector<HTMLButtonElement>('button[aria-label="Retry upload of flaky"]');
    expect(retry).not.toBeNull();
    await act(async () => retry!.click());
    await flush();

    expect(attempts).toBe(2);
    expect(toolbar().querySelector('[data-attachment-status]')).toBeNull();
    expect(toolbar().querySelector('button[aria-label="Remove flaky"]')).not.toBeNull();
  });

  test('images survive draft save/restore when the composer is dismissed and reopened for the same range', async () => {
    useFinePointer();
    stubTransport(async (file) => ({ path: `/uploads/${file.name}` }));
    const { ref } = await mountToolbarHost();

    const range = { start: 8, end: 8, side: 'additions' as const };
    await act(async () => {
      ref.current?.openLineAnnotation(range);
    });
    await flush();
    await pasteInto(toolbar().querySelector('textarea')!, imageFile('draft.png'));
    expect(thumbnails()).toHaveLength(1);

    // Dismiss (Escape) saves the draft and hides the toolbar.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(document.querySelector('.review-toolbar')).toBeNull();

    // Reopen the same range: the image should come back from the draft.
    await act(async () => {
      ref.current?.openLineAnnotation(range);
    });
    await flush();

    expect(thumbnails()).toHaveLength(1);
    expect(toolbar().querySelector('button[aria-label="Remove draft"]')).not.toBeNull();
  });

  test('editing an existing annotation reloads its images and re-saves the edited list', async () => {
    useFinePointer();
    stubTransport(async (file) => ({ path: `/uploads/${file.name}` }));
    const { ref, edited } = await mountToolbarHost();

    const existing: CodeAnnotation = {
      id: 'ann-1',
      type: 'comment',
      scope: 'line',
      filePath: 'src/example.ts',
      lineStart: 12,
      lineEnd: 12,
      side: 'new',
      text: 'existing comment',
      images: [{ path: '/uploads/before.png', name: 'before' }],
      createdAt: Date.now(),
    };

    await act(async () => {
      ref.current?.startEdit(existing);
    });
    await flush();

    // The saved image reloads into the composer.
    expect(thumbnails()).toHaveLength(1);
    expect(toolbar().querySelector('button[aria-label="Remove before"]')).not.toBeNull();

    // Add a second image, then remove the original one before saving.
    await pasteInto(toolbar().querySelector('textarea')!, imageFile('after.png'));
    expect(thumbnails()).toHaveLength(2);

    const removeBefore = toolbar().querySelector<HTMLButtonElement>('button[aria-label="Remove before"]')!;
    await act(async () => removeBefore.click());
    await flush();
    expect(thumbnails()).toHaveLength(1);

    await act(async () => submitButton().click());

    expect(edited).toHaveLength(1);
    expect(edited[0].id).toBe('ann-1');
    expect(edited[0].images).toEqual([{ path: '/uploads/after.png', name: 'after' }]);
  });
});
