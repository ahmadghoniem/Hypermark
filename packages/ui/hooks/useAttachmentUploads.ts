import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageAttachment } from '../types';
import type { PendingAttachment } from '../components/AttachmentStrip';
import { deriveImageName } from '../utils/imageNames';
import { assertUploadResult, getUploadTransport } from '../utils/upload';

interface UseAttachmentUploadsOptions {
  /** Already-stored attachments, used for name deduplication. */
  images: readonly ImageAttachment[];
  /** Called once an upload produced a usable stored reference. */
  onAdd: (image: ImageAttachment) => void;
  /** Off → `attachFiles` ignores everything (surfaces without attachments). */
  enabled?: boolean;
}

export interface AttachmentUploads {
  pending: PendingAttachment[];
  /** Upload every image file in the list; non-images are ignored. */
  attachFiles: (files: Iterable<File> | FileList | null | undefined) => void;
  retry: (id: string) => void;
  removePending: (id: string) => void;
}

let uploadSeq = 0;

/**
 * Owns in-flight composer attachments (spec 05 §3.2.4–5).
 *
 * A selected file occupies a strip slot immediately, keeps its local preview
 * through failure, and only becomes an `ImageAttachment` once the transport
 * returned a usable path. Failures retain the file so Retry re-sends the same
 * bytes; a completion that lands after the composer unmounted is dropped rather
 * than written to a stale comment.
 */
export function useAttachmentUploads({
  images,
  onAdd,
  enabled = true,
}: UseAttachmentUploadsOptions): AttachmentUploads {
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  // Mirror of `pending`, so queuing an upload can read the current names
  // without doing side effects inside a state updater (which React may call
  // twice).
  const pendingRef = useRef<PendingAttachment[]>([]);
  // Files are kept out of state: Retry needs the exact bytes, and re-rendering
  // must not depend on them.
  const files = useRef(new Map<string, File>());
  const previews = useRef(new Map<string, string>());
  const alive = useRef(true);
  // Names of images already stored, read at upload time so concurrent uploads
  // do not collide on a stale snapshot.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const url of previews.current.values()) URL.revokeObjectURL(url);
      previews.current.clear();
      files.current.clear();
    };
  }, []);

  /** Single writer for both the state and its ref mirror. */
  const updatePending = useCallback(
    (next: (prev: PendingAttachment[]) => PendingAttachment[]) => {
      pendingRef.current = next(pendingRef.current);
      setPending(pendingRef.current);
    },
    [],
  );

  const releasePending = useCallback((id: string) => {
    const url = previews.current.get(id);
    if (url) URL.revokeObjectURL(url);
    previews.current.delete(id);
    files.current.delete(id);
  }, []);

  const runUpload = useCallback(
    async (id: string, file: File, name: string) => {
      try {
        const result = assertUploadResult(await getUploadTransport().upload(file));
        if (!alive.current) return;
        releasePending(id);
        updatePending((prev) => prev.filter((p) => p.id !== id));
        onAddRef.current({ path: result.path, name });
      } catch (err) {
        if (!alive.current) return;
        const message = err instanceof Error ? err.message : 'Upload failed';
        updatePending((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: 'error', error: message } : p)),
        );
      }
    },
    [releasePending, updatePending],
  );

  const attachFiles = useCallback<AttachmentUploads['attachFiles']>(
    (input) => {
      if (!enabled || !input) return;
      const list = Array.from(input as Iterable<File>).filter((f) => f?.type?.startsWith('image/'));
      if (list.length === 0) return;

      // Reserve names against saved images plus the pending ones already queued.
      const existing = [
        ...imagesRef.current.map((i) => i.name),
        ...pendingRef.current.map((p) => p.name),
      ];
      const added: PendingAttachment[] = [];
      for (const file of list) {
        const id = `attachment-${++uploadSeq}`;
        const name = deriveImageName(file.name, [...existing, ...added.map((a) => a.name)]);
        const previewUrl = URL.createObjectURL(file);
        previews.current.set(id, previewUrl);
        files.current.set(id, file);
        added.push({ id, name, previewUrl, status: 'uploading' });
      }
      updatePending((prev) => [...prev, ...added]);
      for (const item of added) {
        void runUpload(item.id, files.current.get(item.id)!, item.name);
      }
    },
    [enabled, runUpload, updatePending],
  );

  const retry = useCallback(
    (id: string) => {
      const file = files.current.get(id);
      if (!file) return;
      const name = pendingRef.current.find((p) => p.id === id)?.name;
      if (!name) return;
      updatePending((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: 'uploading', error: undefined } : p)),
      );
      void runUpload(id, file, name);
    },
    [runUpload, updatePending],
  );

  const removePending = useCallback(
    (id: string) => {
      releasePending(id);
      updatePending((prev) => prev.filter((p) => p.id !== id));
    },
    [releasePending, updatePending],
  );

  return { pending, attachFiles, retry, removePending };
}

/** Pull image files out of a paste or drop payload. */
export function imageFilesFrom(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const out: File[] = [];
  if (data.files?.length) {
    for (const file of Array.from(data.files)) {
      if (file.type.startsWith('image/')) out.push(file);
    }
  }
  if (out.length === 0 && data.items) {
    for (const item of Array.from(data.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) out.push(file);
      }
    }
  }
  return out;
}
