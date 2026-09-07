/**
 * Spec 05 — the composer attachment contract (§3.2), starting from the step-1
 * reproduction.
 *
 * Step 1 recorded the failure: a successfully uploaded image updated
 * `CommentPopover`'s `images` state but had nowhere to appear, because the
 * composer body rendered no thumbnail strip and `AttachmentsButton`'s own
 * popover had already closed. Pasting into the composer was worse — it bypassed
 * the comment entirely and landed in the document's `globalAttachments`.
 *
 * Step 3 lands the strip and the composer-owned paste/drop paths, so the two
 * reproductions below now run instead of being skipped.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CommentPopover } from './CommentPopover';
import type { ImageAttachment } from '../types';
import {
  setUploadTransport,
  resetUploadTransport,
  type UploadTransport,
  type UploadResult,
} from '../utils/upload';

const hasDom = typeof document !== 'undefined';

let root: Root | null = null;
let host: HTMLElement | null = null;

interface MountPopoverOptions {
  initialText?: string;
  allowImages?: boolean;
  draftKey?: string;
  onSubmit?: (text: string, images?: ImageAttachment[]) => void;
}

async function mountPopover(options: MountPopoverOptions = {}): Promise<void> {
  const anchor = document.createElement('div');
  anchor.textContent = 'Anchor target';
  document.body.appendChild(anchor);

  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      <CommentPopover
        anchorEl={anchor}
        contextText="Selected text excerpt"
        isGlobal={false}
        initialText={options.initialText ?? ''}
        allowImages={options.allowImages ?? true}
        draftKey={options.draftKey}
        onSubmit={options.onSubmit ?? (() => {})}
        onClose={() => {}}
      />,
    );
  });
  await flush();
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function popover(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-comment-popover="true"]');
  if (!el) throw new Error('composer is not mounted');
  return el;
}

function strip(): HTMLElement | null {
  return popover().querySelector<HTMLElement>('[data-attachment-strip]');
}

/**
 * Strip entries. Asserting on the list items rather than on `<img>` keeps these
 * tests honest in happy-dom, where no image URL ever actually loads and every
 * saved thumbnail falls back to its explicit unavailable state.
 */
function thumbnails(): HTMLElement[] {
  return Array.from(strip()?.querySelectorAll<HTMLElement>('[role="listitem"]') ?? []);
}

function imageFile(name: string): File {
  return new File(['image-bytes'], name, { type: 'image/png' });
}

function transferWith(file: File): DataTransfer {
  const data = new DataTransfer();
  data.items.add(file);
  return data;
}

/** Dispatch a paste carrying `file` at `target`, the way a browser would. */
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
});

describe.if(hasDom)('Spec 05 §3.2 — attachments inside the comment composer', () => {
  test('an image pasted into the composer uploads and appears in the in-composer strip', async () => {
    const uploaded: File[] = [];
    stubTransport(async (file): Promise<UploadResult> => {
      uploaded.push(file);
      return { path: `/uploads/${file.name}`, originalName: file.name };
    });

    await mountPopover();

    const textarea = popover().querySelector('textarea');
    expect(textarea).not.toBeNull();
    await pasteInto(textarea!, imageFile('pasted-mockup.png'));

    expect(uploaded).toHaveLength(1);
    expect(strip()).not.toBeNull();
    expect(thumbnails()).toHaveLength(1);
    expect(
      popover().querySelector('button[aria-label="Remove pasted-mockup"]'),
    ).not.toBeNull();
  });

  test('the strip sits between the textarea and the action row, not in a floating card', async () => {
    stubTransport(async (file) => ({ path: `/uploads/${file.name}` }));
    await mountPopover();

    await pasteInto(popover().querySelector('textarea')!, imageFile('diagram.png'));

    const stripEl = strip();
    expect(stripEl).not.toBeNull();
    const textareaBlock = popover().querySelector('textarea')!.closest('div.relative')!;
    const saveButton = Array.from(popover().querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Save',
    )!;
    // DOM order: textarea block → strip → action row containing Save.
    expect(
      textareaBlock.compareDocumentPosition(stripEl!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      stripEl!.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(stripEl!.contains(saveButton)).toBe(false);
  });

  test('an image dropped on the composer attaches to the comment', async () => {
    stubTransport(async (file) => ({ path: `/uploads/${file.name}` }));
    await mountPopover();

    const textareaBlock = popover().querySelector('textarea')!.closest('div.relative')!;
    await act(async () => {
      const event = new Event('drop', { bubbles: true, cancelable: true }) as Event & {
        dataTransfer: DataTransfer;
      };
      event.dataTransfer = transferWith(imageFile('dropped.png'));
      textareaBlock.dispatchEvent(event);
    });
    await flush();

    expect(thumbnails()).toHaveLength(1);
    expect(popover().querySelector('button[aria-label="Remove dropped"]')).not.toBeNull();
  });

  test('an image added through the picker shows in the composer, not only in the picker popover', async () => {
    await mountPopover();

    const attachButton = popover().querySelector<HTMLButtonElement>(
      'button[aria-label="Attachments"]',
    );
    expect(attachButton).not.toBeNull();
    await act(async () => attachButton!.click());

    const pathInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="Paste path or URL..."]',
    );
    expect(pathInput).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(pathInput!, '/screens/Login Mockup.png');
      pathInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const addButton = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Add',
    );
    await act(async () => addButton!.click());
    await flush();

    expect(thumbnails()).toHaveLength(1);
    expect(
      popover().querySelector('button[aria-label="Remove login-mockup"]'),
    ).not.toBeNull();
  });

  test('the thumbnail carries the filename as accessible name and tooltip, never as strip copy', async () => {
    stubTransport(async (file) => ({ path: `/uploads/${file.name}` }));
    await mountPopover();
    await pasteInto(popover().querySelector('textarea')!, imageFile('architecture.png'));

    const stripEl = strip()!;
    const item = thumbnails()[0];
    // Filename reaches assistive tech through the tooltip and the remove
    // control's accessible name, and through the image alt when the bytes load.
    expect(item.getAttribute('title')).toBe('architecture');
    expect(stripEl.querySelector('button[aria-label="Remove architecture"]')).not.toBeNull();
    const img = item.querySelector('img');
    if (img) expect(img.getAttribute('alt')).toBe('architecture');
    // No filename or byte-size label rendered as ordinary strip copy.
    expect(stripEl.textContent).not.toContain('architecture');
    expect(stripEl.textContent).not.toContain('.png');
    expect(stripEl.textContent).not.toContain('KB');
  });

  test('removing the only attachment returns focus to the attach action', async () => {
    stubTransport(async (file) => ({ path: `/uploads/${file.name}` }));
    await mountPopover();
    await pasteInto(popover().querySelector('textarea')!, imageFile('shot.png'));

    const remove = popover().querySelector<HTMLButtonElement>('button[aria-label="Remove shot"]')!;
    await act(async () => remove.click());
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(strip()).toBeNull();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Attachments');
  });

  test('an image-only comment can be submitted', async () => {
    stubTransport(async (file) => ({ path: `/uploads/${file.name}` }));
    const submitted: Array<{ text: string; images?: ImageAttachment[] }> = [];
    await mountPopover({ onSubmit: (text, images) => submitted.push({ text, images }) });

    await pasteInto(popover().querySelector('textarea')!, imageFile('only-image.png'));

    const save = Array.from(popover().querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Save',
    )!;
    expect(save.hasAttribute('disabled')).toBe(false);
    await act(async () => save.click());

    expect(submitted).toHaveLength(1);
    expect(submitted[0].text).toBe('');
    expect(submitted[0].images).toEqual([{ path: '/uploads/only-image.png', name: 'only-image' }]);
  });

  test('a failed upload keeps the typed text and the attachment, and Retry re-sends it', async () => {
    let attempts = 0;
    stubTransport(async (file) => {
      attempts += 1;
      if (attempts === 1) throw new Error('network down');
      return { path: `/uploads/${file.name}` };
    });

    await mountPopover({ initialText: 'please look at this' });
    await pasteInto(popover().querySelector('textarea')!, imageFile('flaky.png'));

    expect(popover().querySelector('[data-attachment-status="error"]')).not.toBeNull();
    expect(popover().querySelector('textarea')!.value).toBe('please look at this');

    const retry = popover().querySelector<HTMLButtonElement>(
      'button[aria-label="Retry upload of flaky"]',
    );
    expect(retry).not.toBeNull();
    await act(async () => retry!.click());
    await flush();

    expect(attempts).toBe(2);
    expect(popover().querySelector('[data-attachment-status]')).toBeNull();
    expect(popover().querySelector('button[aria-label="Remove flaky"]')).not.toBeNull();
  });

  test('a malformed upload response is rejected instead of recorded as a stored image', async () => {
    // Successful HTTP call, but no usable path — the classic "reported success
    // without a usable stored image reference" case spec 05 §3.2.4 forbids.
    stubTransport(async () => ({ path: '   ' }) as UploadResult);
    await mountPopover();

    await pasteInto(popover().querySelector('textarea')!, imageFile('broken.png'));

    expect(popover().querySelector('[data-attachment-status="error"]')).not.toBeNull();
    expect(popover().querySelector('button[aria-label="Remove broken"]')).not.toBeNull();
    const save = Array.from(popover().querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Save',
    )!;
    // Nothing was added to the comment's images, so an empty comment stays unsubmittable.
    expect(save.hasAttribute('disabled')).toBe(true);
  });

  test('a saved reference whose bytes are gone shows an explicit unavailable state, not a silent removal', async () => {
    stubTransport(async (file) => ({ path: `/uploads/${file.name}` }));
    await mountPopover();
    await pasteInto(popover().querySelector('textarea')!, imageFile('missing.png'));

    const img = thumbnails()[0].querySelector('img');
    if (img) {
      await act(async () => {
        img.dispatchEvent(new Event('error'));
      });
    }

    expect(popover().querySelector('[data-attachment-unavailable]')).not.toBeNull();
    expect(popover().querySelector('button[aria-label="Remove missing"]')).not.toBeNull();
  });
});
