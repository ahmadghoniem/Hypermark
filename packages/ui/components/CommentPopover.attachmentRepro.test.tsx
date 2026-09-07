/**
 * Reproduction test for Spec 05 Step 1:
 * "selected image does not appear in the composer"
 *
 * This test reproduces the observed failure where a successfully selected /
 * uploaded image does not appear as an in-composer thumbnail strip in CommentPopover.
 *
 * Marked as test.skip per spec 05 §5 step 1 and the prompt instructions:
 * "The one exception: the step-1 reproduction test is expected to fail if the
 * bug reproduces. Mark it clearly (a test.todo, or a skipped test with a comment
 * naming what it will assert once step 3 lands) so the suite stays green, and say
 * in your report exactly what it asserts and why it currently cannot pass."
 *
 * Once Step 3 lands:
 * 1. CommentPopover will render the thumbnail strip inside the composer (after textarea, before footer).
 * 2. An uploaded image will render as a compact thumbnail with an accessible remove control ("Remove <filename>").
 * 3. Textarea paste of image files will route directly into the composer via UploadTransport.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CommentPopover } from './CommentPopover';
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
        onSubmit={() => {}}
        onClose={() => {}}
      />,
    );
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
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

describe.if(hasDom)('Spec 05 Step 1 Reproduction: Selected image does not appear in composer', () => {
  // Marked as test.skip per spec 05 §5 step 1 and instructions:
  // It asserts the spec 05 §3.2 layout contract (thumbnail strip inside the composer
  // after the textarea and before the footer action row), which currently fails because
  // CommentPopover has no thumbnail strip inside the composer body.
  test.skip('reproduction: successfully uploaded image via UploadTransport renders in-composer thumbnail strip', async () => {
    const uploadedFiles: File[] = [];
    const stubTransport: UploadTransport = {
      upload: async (file: File): Promise<UploadResult> => {
        uploadedFiles.push(file);
        return {
          path: `/uploads/${file.name}`,
          originalName: file.name,
        };
      },
    };
    setUploadTransport(stubTransport);

    await mountPopover();

    // 1. Locate composer
    const popover = document.querySelector<HTMLElement>('[data-comment-popover="true"]');
    expect(popover).not.toBeNull();

    // 2. Open attachments picker
    const attachBtn = popover!.querySelector<HTMLButtonElement>('button[aria-label="Attachments"]');
    expect(attachBtn).not.toBeNull();
    await act(async () => attachBtn!.click());

    // 3. Select an image file via the file input
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const testFile = new File(['fake-png-data'], 'architecture.png', { type: 'image/png' });
    await act(async () => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(testFile);
      fileInput!.files = dataTransfer.files;
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Currently FAILS here in Step 1:
    // When file selection occurs, AttachmentsButton.tsx:123 sets isOpen(false) and
    // opens the modal ImageAnnotator. Even after transport upload completes:
    // Spec 05 §3.2 requires an image-only horizontal thumbnail strip INSIDE the composer
    // ([data-attachment-strip] or thumbnail elements with remove buttons).
    // Today, CommentPopover.tsx renders no thumbnail strip in the composer body;
    // the only visual feedback is a 20x20px stacked avatar icon in the footer button.
    const thumbnailStrip = popover!.querySelector('[data-attachment-strip]');
    expect(thumbnailStrip).not.toBeNull();

    // The strip must contain the thumbnail and an accessible remove control
    const removeControl = popover!.querySelector('button[aria-label^="Remove architecture"]');
    expect(removeControl).not.toBeNull();
  });

  // Marked as test.skip per spec 05 §5 step 1:
  // Asserts that pasting an image into the composer textarea attaches to the comment.
  // Currently FAILS because CommentPopover has no onPaste handler, AttachmentsButton
  // ignores paste when closed, and the event bubbles to App.tsx's globalAttachments.
  test.skip('reproduction: pasting an image into composer textarea attaches to the comment via UploadTransport', async () => {
    let uploadCalled = false;
    const stubTransport: UploadTransport = {
      upload: async (file: File): Promise<UploadResult> => {
        uploadCalled = true;
        return {
          path: `/uploads/${file.name}`,
          originalName: file.name,
        };
      },
    };
    setUploadTransport(stubTransport);

    await mountPopover();

    const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).not.toBeNull();

    // Simulate pasting an image into the composer textarea
    const pasteFile = new File(['image-bytes'], 'pasted-mockup.png', { type: 'image/png' });
    await act(async () => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(pasteFile);
      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
      pasteEvent.clipboardData = dataTransfer;
      textarea!.dispatchEvent(pasteEvent);
    });

    // Currently FAILS:
    // CommentPopover does not handle onPaste on the textarea.
    // The paste event is not routed to UploadTransport for this comment draft.
    expect(uploadCalled).toBe(true);

    const popover = document.querySelector<HTMLElement>('[data-comment-popover="true"]');
    const removeControl = popover!.querySelector('button[aria-label^="Remove pasted-mockup"]');
    expect(removeControl).not.toBeNull();
  });
});
