/**
 * Auto-save code review annotation drafts to the server.
 *
 * Similar to useAnnotationDraft but stores CodeAnnotation[] directly
 * (they're already compact — no tuple conversion needed).
 */

import { useEffect, useCallback, useRef } from 'react';
import type { CodeAnnotation, ImageAttachment } from '../types';
import { getDraftTransport, readDraftGeneration, formatTimeAgo, DEBOUNCE_MS } from './useAnnotationDraft';
import { draftStore } from '../components/CommentPopover';

interface DraftData {
  codeAnnotations: CodeAnnotation[];
  composer?: { key: string; text: string; images: ImageAttachment[]; ts: number } | null;
  draftGeneration?: number;
  ts: number;
}

interface UseCodeAnnotationDraftOptions {
  annotations: CodeAnnotation[];
  isApiMode: boolean;
  submitted: boolean;
  onDraftLoaded?: (
    draft: { annotations: CodeAnnotation[] },
    meta: { count: number; timeAgo: string },
  ) => void | Promise<void>;
}

interface UseCodeAnnotationDraftResult {
  restoreDraft: () => { annotations: CodeAnnotation[] };
  getDraftGeneration: () => number;
  discardDraft: () => void;
  flushDraft: () => void;
}

export function useCodeAnnotationDraft({
  annotations,
  isApiMode,
  submitted,
  onDraftLoaded,
}: UseCodeAnnotationDraftOptions): UseCodeAnnotationDraftResult {
  const draftDataRef = useRef<DraftData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMountedRef = useRef(false);
  const draftGenerationRef = useRef(0);
  const latestComposerRef = useRef<{ key: string; text: string; images: ImageAttachment[] } | null>(null);
  // True once the user has actually had annotations this session. Used to decide
  // whether an empty state is a real "cleared everything" edit (persist it) vs a
  // fresh/unengaged session (leave the server alone).
  const hasHadAnnotationsRef = useRef(false);

  // Load draft on mount
  useEffect(() => {
    if (!isApiMode) return;

    getDraftTransport().load()
      .then(({ data, generation }) => {
        if (generation !== null) {
          draftGenerationRef.current = Math.max(draftGenerationRef.current, generation);
        }
        return data as DraftData | null;
      })
      .then((data: DraftData | null) => {
        const generation = readDraftGeneration(data?.draftGeneration);
        if (generation !== null) {
          draftGenerationRef.current = Math.max(draftGenerationRef.current, generation);
        }

        // Restore open composer into draftStore before annotations are applied
        if (data?.composer?.key) {
          draftStore.set(data.composer.key, {
            text: data.composer.text,
            images: data.composer.images || [],
          });
          latestComposerRef.current = {
            key: data.composer.key,
            text: data.composer.text,
            images: data.composer.images || [],
          };
        }

        const annotationCount = Array.isArray(data?.codeAnnotations) ? data.codeAnnotations.length : 0;
        const hasComposer = !!data?.composer && (((data.composer.text?.trim().length ?? 0) > 0) || ((data.composer.images?.length ?? 0) > 0));

        if (annotationCount > 0 || hasComposer) {
          draftDataRef.current = data;
          onDraftLoaded?.(
            { annotations: data?.codeAnnotations ?? [] },
            {
              count: annotationCount,
              timeAgo: formatTimeAgo(data?.ts || 0),
            },
          );
        }
        hasMountedRef.current = true;
      })
      .catch(() => {
        hasMountedRef.current = true;
      });
  }, [isApiMode, onDraftLoaded]);

  const persistNow = useCallback((keepalive: boolean) => {
    if (!isApiMode || submitted) return;

    const composerEntry = latestComposerRef.current;
    const composer = composerEntry && (composerEntry.text.trim().length > 0 || composerEntry.images.length > 0)
      ? { key: composerEntry.key, text: composerEntry.text, images: composerEntry.images, ts: Date.now() }
      : null;

    const isEmpty = annotations.length === 0 && !composer;
    // Leave the server alone for an empty state until the user has actually had
    // annotations this session. This preserves an unrestored draft sitting on disk
    // at mount.
    if (isEmpty && !hasHadAnnotationsRef.current) return;

    const draftGeneration = draftGenerationRef.current + 1;
    draftGenerationRef.current = draftGeneration;

    if (isEmpty) {
      // The user cleared everything (#948). Delete the draft with a generation
      // tombstone so it can't resurface on refresh and a late save can't revive
      // it. Mirrors useAnnotationDraft.persistNow — routed through the draft
      // transport seam so a host backend tombstones its own stored draft too.
      getDraftTransport().remove(draftGeneration, { keepalive }).catch(() => {});
      return;
    }

    const payload: DraftData = {
      codeAnnotations: annotations,
      composer,
      draftGeneration,
      ts: Date.now(),
    };

    getDraftTransport().save(payload, { keepalive }).catch(() => {});
  }, [annotations, isApiMode, submitted]);

  const scheduleDraftSave = useCallback(() => {
    if (!isApiMode || submitted || !hasMountedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      persistNow(false);
    }, DEBOUNCE_MS);
  }, [isApiMode, persistNow, submitted]);

  // Debounced auto-save on annotation changes
  useEffect(() => {
    if (!isApiMode || submitted) return;
    if (!hasMountedRef.current) return;

    // Track engagement on USER-AUTHORED annotations only. External/SSE annotations
    // (source-tagged, e.g. an eslint plugin) arrive via `allAnnotations` and have
    // their own lifecycle, separate from the draft; they must NOT count as "had content",
    // or a later empty state would look like the user deleted everything and wrongly delete the draft.
    if (annotations.some((a) => !a.source)) hasHadAnnotationsRef.current = true;

    scheduleDraftSave();
  }, [annotations, isApiMode, submitted, scheduleDraftSave]);

  // Subscribe to open-composer changes from CommentPopover's draftStore
  useEffect(() => {
    return draftStore.subscribe((entry) => {
      latestComposerRef.current = entry;
      scheduleDraftSave();
    });
  }, [scheduleDraftSave]);

  // Flush a pending save when the page is backgrounded or closed — mirrors
  // useAnnotationDraft so review drafts also survive tab close.
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

  const restoreDraft = useCallback(() => {
    // Cancel any pending autosave so it can't fire with pre-restore state and
    // overwrite what we're about to restore.
    if (timerRef.current) clearTimeout(timerRef.current);
    const data = draftDataRef.current;
    draftDataRef.current = null;
    return {
      annotations: data?.codeAnnotations ?? [],
    };
  }, []);

  const getDraftGeneration = useCallback(() => draftGenerationRef.current + 1, []);

  const discardDraft = useCallback(() => {
    // Cancel any pending autosave so a late save can't revive the draft the user
    // just discarded.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const deletedGeneration = draftGenerationRef.current + 1;
    draftGenerationRef.current = deletedGeneration;
    draftDataRef.current = null;
    latestComposerRef.current = null;
    getDraftTransport().remove(deletedGeneration, { keepalive: false }).catch(() => {});
  }, []);

  return { restoreDraft, getDraftGeneration, discardDraft, flushDraft };
}
