/**
 * Auto-save code review annotation drafts to the server.
 *
 * Similar to useAnnotationDraft but stores CodeAnnotation[] directly
 * (they're already compact — no tuple conversion needed).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CodeAnnotation } from '../types';
import { getDraftTransport } from './useAnnotationDraft';

const DEBOUNCE_MS = 500;

interface DraftData {
  codeAnnotations: CodeAnnotation[];
  draftGeneration?: number;
  ts: number;
}

function readDraftGeneration(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function formatTimeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

interface UseCodeAnnotationDraftOptions {
  annotations: CodeAnnotation[];
  isApiMode: boolean;
  submitted: boolean;
}

interface UseCodeAnnotationDraftResult {
  draftBanner: { count: number; timeAgo: string } | null;
  restoreDraft: () => { annotations: CodeAnnotation[] };
  getDraftGeneration: () => number;
  dismissDraft: () => void;
}

export function useCodeAnnotationDraft({
  annotations,
  isApiMode,
  submitted,
}: UseCodeAnnotationDraftOptions): UseCodeAnnotationDraftResult {
  const [draftBanner, setDraftBanner] = useState<{ count: number; timeAgo: string } | null>(null);
  const draftDataRef = useRef<DraftData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMountedRef = useRef(false);
  const draftGenerationRef = useRef(0);
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
        const annotationCount = Array.isArray(data?.codeAnnotations) ? data.codeAnnotations.length : 0;
        if (annotationCount > 0) {
          draftDataRef.current = data;
          setDraftBanner({
            count: annotationCount,
            timeAgo: formatTimeAgo(data?.ts || 0),
          });
        }
        hasMountedRef.current = true;
      })
      .catch(() => {
        hasMountedRef.current = true;
      });
  }, [isApiMode]);

  // Debounced auto-save on annotation changes
  useEffect(() => {
    if (!isApiMode || submitted) return;
    if (!hasMountedRef.current) return;

    // Track engagement on USER-AUTHORED annotations only. External/SSE annotations
    // (source-tagged, e.g. an eslint plugin) arrive via `allAnnotations` and have
    // their own lifecycle, separate from the draft; they must NOT count as "had content",
    // or a later empty state would look like the user deleted everything and wrongly delete the draft.
    if (annotations.some((a) => !a.source)) hasHadAnnotationsRef.current = true;

    const isEmpty = annotations.length === 0;
    // Leave the server alone for an empty state until the user has actually had
    // annotations this session. This preserves an unrestored draft sitting on disk
    // at mount (the draft-recovery banner can still offer it).
    if (isEmpty && !hasHadAnnotationsRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const draftGeneration = draftGenerationRef.current + 1;
      draftGenerationRef.current = draftGeneration;

      if (isEmpty) {
        // The user cleared everything (#948). Delete the draft with a generation
        // tombstone so it can't resurface on refresh and a late save can't revive
        // it. Mirrors useAnnotationDraft.persistNow — routed through the draft
        // transport seam so a host backend tombstones its own stored draft too.
        getDraftTransport().remove(draftGeneration, { keepalive: false }).catch(() => {});
        return;
      }

      const payload: DraftData = {
        codeAnnotations: annotations,
        draftGeneration,
        ts: Date.now(),
      };

      getDraftTransport().save(payload, { keepalive: false }).catch(() => {});
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [annotations, isApiMode, submitted]);

  const restoreDraft = useCallback(() => {
    // Cancel any pending autosave so it can't fire with pre-restore state and
    // overwrite what we're about to restore.
    if (timerRef.current) clearTimeout(timerRef.current);
    const data = draftDataRef.current;
    setDraftBanner(null);
    draftDataRef.current = null;
    return {
      annotations: data?.codeAnnotations ?? [],
    };
  }, []);

  const getDraftGeneration = useCallback(() => draftGenerationRef.current + 1, []);

  const dismissDraft = useCallback(() => {
    // Cancel any pending autosave so a late save can't revive the draft the user
    // just dismissed.
    if (timerRef.current) clearTimeout(timerRef.current);
    const deletedGeneration = draftGenerationRef.current + 1;
    draftGenerationRef.current = deletedGeneration;
    setDraftBanner(null);
    draftDataRef.current = null;
    getDraftTransport().remove(deletedGeneration, { keepalive: false }).catch(() => {});
  }, []);

  return { draftBanner, restoreDraft, getDraftGeneration, dismissDraft };
}
