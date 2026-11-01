/**
 * Auto-save annotation drafts to the server.
 *
 * Stores full Annotation[] objects directly (preserving all fields
 * including `source`, `id`, offsets, and meta). On mount, checks for
 * an existing draft and exposes banner state for the UI to offer restoration.
 *
 * Backward compatible: loads old tuple-serialized drafts via fromShareable()
 * from utils/annotationSerialization (the read-only decoder boundary).
 */

import { useEffect, useCallback, useRef } from 'react';
import type { Annotation, ImageAttachment } from '../types';
import { fromShareable, parseShareableImages } from '../utils/annotationSerialization';
import type { ShareableAnnotation } from '../utils/annotationSerialization';
import { normalizeDocumentAnnotations } from '../utils/attachmentNormalization';

export const DEBOUNCE_MS = 500;

/**
 * Transport for persisting annotation drafts through Hypermark's `/api/draft`
 * server protocol, which uses a generation handshake so ghost drafts do not
 * resurrect:
 *  - `save` is best-effort on page close (`keepalive`, with a
 *    retry-without-keepalive on failure gated by a generation match).
 *  - `remove(generation)` is a generation-gated TOMBSTONE: the server rejects
 *    any later `save` whose `draftGeneration` is <= the deleted generation.
 *    The hook pre-increments `draftGeneration` and exposes it through
 *    `getDraftGeneration()` so feedback/exit send it and the
 *    server deletes the draft with the right generation.
 *  - `load` returns the raw stored body (or null) plus the generation the
 *    server reports when there is NO draft (read from the 404 body) so the
 *    client can resume past a tombstone.
 */
export interface DraftTransport {
  /** GET the draft. `data` is the raw stored body (null if none). `generation`
      is the store's reported generation when there is no draft (null otherwise). */
  load(): Promise<{ data: unknown | null; generation: number | null }>;
  /** Persist the draft body. `keepalive` requests best-effort delivery on close. */
  save(body: object, opts: { keepalive: boolean }): Promise<void>;
  /** Generation-gated tombstone delete. */
  remove(generation: number, opts: { keepalive: boolean }): Promise<void>;
}

/**
 * The `/api/draft` fetches. `save` rejects on failure (the keepalive retry stays in the hook so its
 * generation-match gate is preserved); `remove` always resolves.
 */
const draftTransport: DraftTransport = {
  async load() {
    const res = await fetch('/api/draft');
    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const generation = readDraftGeneration(
        (data as MissingDraftData | null)?.draftGeneration,
      );
      return { data: null, generation };
    }
    return { data, generation: null };
  },
  save(body, { keepalive }) {
    const payload = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json' };
    return fetch('/api/draft', { method: 'POST', headers, body: payload, keepalive }).then(
      () => {},
    );
  },
  remove(generation, { keepalive }) {
    return fetch(`/api/draft?generation=${generation}`, { method: 'DELETE', keepalive }).then(
      () => {},
      () => {},
    );
  },
};

/** The `/api/draft` transport. */
export function getDraftTransport(): DraftTransport {
  return draftTransport;
}

/** Each message's annotations in annotate-last, keyed by message id. */
export type MessageDrafts = Record<string, { annotations: Annotation[]; globalAttachments: ImageAttachment[] }>;

/** New format: full objects. */
interface DraftData {
  /** The annotations on screen when saved. */
  annotations: Annotation[];
  /** In annotate-last with several messages, every message's annotations. */
  messages?: MessageDrafts;
  /** Legacy field, read-only: images no longer write here —
      `normalizeDocumentAnnotations` folds any stored top-level images into a
      GLOBAL_COMMENT inside `annotations` on load, so this stays populated
      only by an old draft body written before the migration and is always
      empty going forward. Kept so old stored drafts still decode. */
  globalAttachments: ImageAttachment[];
  /** Client-side generation used to ignore stale saves after a draft delete. */
  draftGeneration?: number;
  ts: number;
}

interface MissingDraftData {
  found?: false;
  draftGeneration?: number;
}

/** Old format: compact tuples (for backward compat on load). */
interface LegacyDraftData {
  a: ShareableAnnotation[];
  g?: unknown[];
  ts: number;
}

function isLegacyDraft(data: unknown): data is LegacyDraftData {
  return !!data && typeof data === 'object' && 'a' in data && Array.isArray((data as LegacyDraftData).a);
}

function countMessageDrafts(messages: MessageDrafts): number {
  return Object.values(messages).reduce(
    (sum, m) => sum + (m.annotations?.length ?? 0) + (m.globalAttachments?.length ?? 0),
    0,
  );
}

export function readDraftGeneration(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export function formatTimeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

interface UseAnnotationDraftOptions {
  annotations: Annotation[];
  /** Legacy field, always empty now: nothing
      writes new top-level attachments any more, so this is only threaded
      through to keep the save payload's shape stable for old readers. */
  globalAttachments: ImageAttachment[];
  isApiMode: boolean;
  submitted: boolean;
  /** Read at save time; when set, the draft stores every message's annotations. */
  getMessageDrafts?: () => MessageDrafts;
  onDraftLoaded?: (
    draft: RestoredDraft,
    meta: { count: number; timeAgo: string },
  ) => void | Promise<void>;
}

export interface RestoredDraft {
  annotations: Annotation[];
  /** Always empty — restore-time normalization already folded any legacy
      top-level images into a GLOBAL_COMMENT inside `annotations`. Field kept
      for callers that still destructure it. */
  globalAttachments: ImageAttachment[];
  messages?: MessageDrafts;
}

interface UseAnnotationDraftResult {
  restoreDraft: () => RestoredDraft;
  /** Debounced save trigger for changes the reactive deps can't see
      (editor keystrokes, edit commit/discard). Stable identity. */
  scheduleDraftSave: () => void;
  scheduleDraftSaveAfterSubmitFailure: () => void;
  getDraftGeneration: () => number;
  discardDraft: () => void;
  flushDraft: () => void;
}

export function useAnnotationDraft({
  annotations,
  globalAttachments,
  isApiMode,
  submitted,
  getMessageDrafts,
  onDraftLoaded,
}: UseAnnotationDraftOptions): UseAnnotationDraftResult {
  const getMessageDraftsRef = useRef(getMessageDrafts);
  getMessageDraftsRef.current = getMessageDrafts;
  // Read through a ref: callers pass an inline arrow, and a callback dependency
  // would re-run the load effect on every render, restoring (and toasting) again.
  const onDraftLoadedRef = useRef(onDraftLoaded);
  onDraftLoadedRef.current = onDraftLoaded;
  const draftDataRef = useRef<RestoredDraft | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMountedRef = useRef(false);
  const draftGenerationRef = useRef(0);

  // Latest-values ref so the stable scheduleDraftSave reads current data when
  // the debounce fires, without re-creating callbacks per keystroke.
  const latestRef = useRef({ annotations, globalAttachments });
  latestRef.current = { annotations, globalAttachments };
  const canPersist = isApiMode && !submitted;
  const canPersistRef = useRef(canPersist);
  canPersistRef.current = canPersist;

  // Load draft on mount
  useEffect(() => {
    if (!isApiMode) return;

    getDraftTransport().load()
      .then(({ data, generation }) => {
        if (generation !== null) {
          draftGenerationRef.current = Math.max(draftGenerationRef.current, generation);
        }
        return data as DraftData | LegacyDraftData | null;
      })
      .then((data: DraftData | LegacyDraftData | null) => {
        if (!data) {
          hasMountedRef.current = true;
          return;
        }

        let restoredAnnotations: Annotation[];
        let restoredGlobal: ImageAttachment[];
        let restoredMessages: MessageDrafts | undefined;

        if (isLegacyDraft(data)) {
          // Old tuple format — deserialize via fromShareable
          restoredAnnotations = data.a.length > 0 ? fromShareable(data.a) : [];
          restoredGlobal = data.g ? (parseShareableImages(data.g as Parameters<typeof parseShareableImages>[0]) ?? []) : [];
        } else if (Array.isArray(data.annotations)) {
          // New direct-object format
          const generation = readDraftGeneration(data.draftGeneration);
          if (generation !== null) {
            draftGenerationRef.current = Math.max(draftGenerationRef.current, generation);
          }
          restoredAnnotations = data.annotations;
          restoredGlobal = Array.isArray(data.globalAttachments) ? data.globalAttachments : [];
          if (data.messages && typeof data.messages === 'object') restoredMessages = data.messages;
        } else {
          hasMountedRef.current = true;
          return;
        }

        // Images live only on individual comments now. A legacy
        // top-level `globalAttachments` list (or decoded tuple `g`) carries no
        // comment/line anchor, so it is deterministically folded into one
        // image-only GLOBAL_COMMENT annotation rather than kept as a parallel
        // top-level array — idempotent across repeated restore/save cycles
        // because the normalizer reuses the same comment id and dedupes by
        // path against images already owned by an annotation.
        if (restoredGlobal.length > 0) {
          const normalized = normalizeDocumentAnnotations({
            annotations: restoredAnnotations,
            globalAttachments: restoredGlobal,
          });
          restoredAnnotations = normalized.annotations;
          restoredGlobal = normalized.globalAttachments;
        }

        const totalCount = restoredMessages
          ? countMessageDrafts(restoredMessages)
          : restoredAnnotations.length + restoredGlobal.length;

        if (totalCount > 0) {
          const restoredDraftData: RestoredDraft = {
            annotations: restoredAnnotations,
            globalAttachments: restoredGlobal,
            ...(restoredMessages ? { messages: restoredMessages } : {}),
          };
          draftDataRef.current = restoredDraftData;
          onDraftLoadedRef.current?.(restoredDraftData, {
            count: totalCount,
            timeAgo: formatTimeAgo(data.ts || 0),
          });
        }
        hasMountedRef.current = true;
      })
      .catch(() => {
        hasMountedRef.current = true;
      });
  }, [isApiMode]);

  const persistNow = useCallback((keepalive: boolean) => {
    // Re-check: the session may have been submitted while the debounce was
    // pending — a save landing after submit would resurrect a draft the
    // server just deleted, ghosting it into the next session for this document.
    if (!canPersistRef.current) return;
    const { annotations, globalAttachments } = latestRef.current;
    const messages = getMessageDraftsRef.current?.();
    const empty = messages
      ? countMessageDrafts(messages) === 0
      : annotations.length === 0 && globalAttachments.length === 0;

    if (empty) {
      // Everything was cleared (last annotation removed).
      // A stale draft left on disk would offer back content the user
      // explicitly threw away.
      const deletedGeneration = draftGenerationRef.current + 1;
      draftGenerationRef.current = deletedGeneration;
      getDraftTransport().remove(deletedGeneration, { keepalive }).catch(() => {});
      return;
    }

    const draftGeneration = draftGenerationRef.current + 1;
    draftGenerationRef.current = draftGeneration;
    const payload: DraftData = {
      annotations,
      globalAttachments,
      ...(messages ? { messages } : {}),
      draftGeneration,
      ts: Date.now(),
    };

    // The keepalive retry-on-failure is gated on the generation so a superseded
    // save is never resurrected.
    getDraftTransport().save(payload, { keepalive }).catch(() => {
      // Chromium caps keepalive bodies (~64KB); retry without it. Completes
      // fine when the page was only backgrounded, best-effort on close.
      if (keepalive && canPersistRef.current && draftGenerationRef.current === draftGeneration) {
        getDraftTransport().save(payload, { keepalive: false }).catch(() => {});
      }
      // Otherwise silent failure — draft is best-effort.
    });
  }, []);

  const scheduleDraftSave = useCallback(() => {
    if (!canPersistRef.current || !hasMountedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      persistNow(false);
    }, DEBOUNCE_MS);
  }, [persistNow]);

  const scheduleDraftSaveAfterSubmitFailure = useCallback(() => {
    setTimeout(() => {
      scheduleDraftSave();
    }, 0);
  }, [scheduleDraftSave]);

  const getDraftGeneration = useCallback(() => draftGenerationRef.current + 1, []);

  // Flush a pending save when the page is backgrounded or closed — otherwise
  // the last debounce window of typing is lost on tab close, and reopening
  // the (still-running) session would restore a draft missing those
  // keystrokes. Only fires when a save is actually pending.
  useEffect(() => {
    const flush = () => {
      if (timerRef.current === null) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      persistNow(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [persistNow]);

  // Debounced auto-save on content changes. The submitted/isSubmitting gate is
  // read inside the effect, but it is deliberately not a trigger: when a submit
  // attempt finishes and flips the gate back open, we should not recreate a
  // draft that was just deleted unless the user actually changes feedback again.
  useEffect(() => {
    if (!isApiMode || submitted) return;
    if (!hasMountedRef.current) return;
    scheduleDraftSave();
  }, [annotations, globalAttachments, isApiMode, scheduleDraftSave]);

  // Clear any pending save on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flushDraft = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    persistNow(true);
  }, [persistNow]);

  const restoreDraft = useCallback((): RestoredDraft => {
    const data = draftDataRef.current;
    draftDataRef.current = null;

    if (!data) return { annotations: [], globalAttachments: [] };

    return data;
  }, []);

  const discardDraft = useCallback(() => {
    const deletedGeneration = draftGenerationRef.current + 1;
    draftGenerationRef.current = deletedGeneration;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    draftDataRef.current = null;

    getDraftTransport().remove(deletedGeneration, { keepalive: false }).catch(() => {});
  }, []);

  return { restoreDraft, scheduleDraftSave, scheduleDraftSaveAfterSubmitFailure, getDraftGeneration, discardDraft, flushDraft };
}
