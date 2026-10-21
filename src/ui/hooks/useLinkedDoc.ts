/**
 * Linked Document Hook
 *
 * Manages same-view navigation to local .md files referenced in plans.
 * Handles state swapping (save plan state, load doc, restore on back),
 * annotation caching per filepath, and highlight re-application.
 */

import { useState, useCallback, useRef } from "react";
import type { Annotation, ImageAttachment } from "../types";
import type { ViewerHandle } from "../components/Viewer";

export interface LinkedDocLoadData {
  markdown?: string;
  filepath?: string;
}

export interface UseLinkedDocOptions {
  markdown: string;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  /** Legacy, read-only: the host no longer writes new images
      here, so this — and `setGlobalAttachments` below — only carries the
      (always-empty) value along while navigating between the root doc and
      linked docs, for session-cache shape compatibility. */
  globalAttachments: ImageAttachment[];
  setMarkdown: (md: string) => void;
  setAnnotations: (anns: Annotation[]) => void;
  setSelectedAnnotationId: (id: string | null) => void;
  setGlobalAttachments: (att: ImageAttachment[]) => void;
  viewerRef: React.RefObject<ViewerHandle | null>;
  /** Absolute path of the primary document — enables getDocAnnotations() to include
   *  stashed original-file annotations when viewing a linked doc. */
  sourceFilePath?: string;
  /** Snapshot live editor state before linked/folder navigation swaps documents. */
  onBeforeNavigate?: () => void;
}

interface SavedPlanState {
  markdown: string;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  /** Legacy, always empty — see UseLinkedDocOptions.globalAttachments. */
  globalAttachments: ImageAttachment[];
}

export interface CachedDocState {
  annotations: Annotation[];
  /** Legacy, always empty — see UseLinkedDocOptions.globalAttachments. */
  globalAttachments: ImageAttachment[];
  markdown?: string;
}

export interface LinkedDocSessionState {
  root: SavedPlanState;
  docs: Map<string, CachedDocState>;
}

export interface UseLinkedDocReturn {
  /** Whether a linked doc is currently active */
  isActive: boolean;
  /** Resolved filepath of the active linked doc */
  filepath: string | null;
  /** Error from the last open attempt */
  error: string | null;
  /** Whether a fetch is in progress */
  isLoading: boolean;
  /** Open a linked document by path (saves plan state, fetches doc, swaps) */
  open: (docPath: string, buildUrl?: (path: string) => string) => Promise<void>;
  /** Open an already-loaded linked document without refetching from disk */
  openLoaded: (
    doc: LinkedDocLoadData & { filepath: string },
  ) => void;
  /** Return to the plan (caches doc annotations, restores plan state) */
  back: () => void;
  /** Dismiss the current error */
  dismissError: () => void;
  /** All linked doc annotations including the active doc's live state (keyed by filepath) */
  getDocAnnotations: () => Map<string, CachedDocState>;
  /** Snapshot the root document plus linked-doc cache for cross-document session swaps */
  snapshotSession: () => LinkedDocSessionState;
  /** Restore a root document plus linked-doc cache, closing any active linked document */
  restoreSession: (state: LinkedDocSessionState) => void;
  /** Reactive count of annotations on non-active documents (updates on open() and back()) */
  docAnnotationCount: number;
}

const HIGHLIGHT_REAPPLY_DELAY = 100;

export function useLinkedDoc(options: UseLinkedDocOptions): UseLinkedDocReturn {
  const {
    markdown,
    annotations,
    selectedAnnotationId,
    globalAttachments,
    setMarkdown,
    setAnnotations,
    setSelectedAnnotationId,
    setGlobalAttachments,
    viewerRef,
    sourceFilePath,
    onBeforeNavigate,
  } = options;

  const [linkedDoc, setLinkedDoc] = useState<{
    filepath: string;
    markdown?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [docAnnotationCount, setDocAnnotationCount] = useState(0);

  // Stash plan state when navigating to a linked doc
  const savedPlanState = useRef<SavedPlanState | null>(null);

  // Cache linked doc annotations keyed by filepath (persists across back/forth within session)
  const docCache = useRef<Map<string, CachedDocState>>(new Map());

  const defaultBuildUrl = useCallback(
    (path: string) => `/api/doc?path=${encodeURIComponent(path)}`,
    []
  );

  const back = useCallback(() => {
    if (!savedPlanState.current) return;
    onBeforeNavigate?.();

    // Clear web-highlighter marks before swapping content to prevent React DOM mismatch
    viewerRef.current?.clearAllHighlights();

    // Cache current linked doc annotations
    if (linkedDoc) {
      docCache.current.set(linkedDoc.filepath, {
        annotations: [...annotations],
        globalAttachments: [...globalAttachments],
        markdown: linkedDoc.markdown,
      });
      // Update reactive count so button labels can respond
      let total = 0;
      for (const cached of docCache.current.values()) {
        total += cached.annotations.length + cached.globalAttachments.length;
      }
      setDocAnnotationCount(total);
    }

    // Restore plan state
    const saved = savedPlanState.current;
    setMarkdown(saved.markdown);
    setAnnotations(saved.annotations);
    setGlobalAttachments(saved.globalAttachments);
    setSelectedAnnotationId(saved.selectedAnnotationId);
    setLinkedDoc(null);
    setError(null);
    savedPlanState.current = null;

    // Re-apply plan annotation highlights after DOM settles
    if (saved.annotations.length) {
      setTimeout(() => {
        viewerRef.current?.clearAllHighlights();
        viewerRef.current?.applySharedAnnotations(saved.annotations);
      }, HIGHLIGHT_REAPPLY_DELAY);
    }
  }, [
    linkedDoc,
    annotations,
    globalAttachments,
    setMarkdown,
    setAnnotations,
    setSelectedAnnotationId,
    setGlobalAttachments,
    viewerRef,
    onBeforeNavigate,
  ]);

  const activateDocument = useCallback((
    data: LinkedDocLoadData & { filepath: string },
    options: { snapshotCurrent?: boolean } = {},
  ) => {
    const snapshotCurrent = options.snapshotCurrent ?? true;
    if (snapshotCurrent) onBeforeNavigate?.();

    // Backlink detection: if a linked doc links back to the source file (e.g.,
    // original.md → design.md → link back to original.md), opening it as a linked
    // doc would create two competing Map entries for the same filepath in
    // getDocAnnotations(), and the empty linked-doc entry would overwrite the
    // stashed annotations. Instead, treat the backlink as a back() navigation —
    // the current linked doc gets cached and the source file restores with its
    // annotations intact.
    if (sourceFilePath && data.filepath === sourceFilePath && savedPlanState.current) {
      back();
      return;
    }

    // Clear web-highlighter marks before swapping content to prevent React DOM mismatch
    viewerRef.current?.clearAllHighlights();

    // Save current state (plan or another linked doc)
    if (!savedPlanState.current) {
      savedPlanState.current = {
        markdown,
        annotations: [...annotations],
        selectedAnnotationId,
        globalAttachments: [...globalAttachments],
      };
      let total = annotations.length + globalAttachments.length;
      for (const [fp, cached] of docCache.current.entries()) {
        if (fp === data.filepath) continue; // destination becomes active — don't double-count
        total += cached.annotations.length + cached.globalAttachments.length;
      }
      setDocAnnotationCount(total);
    } else if (linkedDoc) {
      // Already viewing a linked doc — cache its annotations before moving on
      docCache.current.set(linkedDoc.filepath, {
        annotations: [...annotations],
        globalAttachments: [...globalAttachments],
        markdown: linkedDoc.markdown,
      });
      let total = 0;
      for (const [fp, cached] of docCache.current.entries()) {
        if (fp === data.filepath) continue; // destination becomes active — don't double-count
        total += cached.annotations.length + cached.globalAttachments.length;
      }
      if (savedPlanState.current) {
        total += savedPlanState.current.annotations.length + savedPlanState.current.globalAttachments.length;
      }
      setDocAnnotationCount(total);
    }

    // Check cache for previous annotations on this file
    const cached = docCache.current.get(data.filepath);

    // Swap to linked doc
    const nextMarkdown = data.markdown ?? cached?.markdown ?? '';
    setMarkdown(nextMarkdown);
    setAnnotations(cached?.annotations ?? []);
    setGlobalAttachments(cached?.globalAttachments ?? []);
    setSelectedAnnotationId(null);
    setLinkedDoc({
      filepath: data.filepath,
      markdown: nextMarkdown,
    });
    setError(null);

    // Re-apply cached annotations after DOM settles
    if (cached?.annotations.length) {
      setTimeout(() => {
        viewerRef.current?.clearAllHighlights();
        viewerRef.current?.applySharedAnnotations(cached.annotations);
      }, HIGHLIGHT_REAPPLY_DELAY);
    }
  }, [
    markdown,
    annotations,
    selectedAnnotationId,
    globalAttachments,
    linkedDoc,
    setMarkdown,
    setAnnotations,
    setSelectedAnnotationId,
    setGlobalAttachments,
    viewerRef,
    sourceFilePath,
    onBeforeNavigate,
    back,
  ]);

  const openLoaded = useCallback((
    doc: LinkedDocLoadData & { filepath: string },
  ) => {
    activateDocument(doc, {
      snapshotCurrent: true,
    });
  }, [activateDocument]);

  const open = useCallback(
    async (docPath: string, buildUrl?: (path: string) => string) => {
      onBeforeNavigate?.();
      setIsLoading(true);
      setError(null);

      try {
        const url = (buildUrl ?? defaultBuildUrl)(docPath);
        const res = await fetch(url);
        const data = (await res.json()) as LinkedDocLoadData & {
          error?: string;
          matches?: string[];
        };

        if (!res.ok || data.error) {
          setError(data.error || "Failed to load document");
          return;
        }

        if (!data.filepath) {
          setError("Failed to load document");
          return;
        }
        activateDocument({ ...data, filepath: data.filepath }, { snapshotCurrent: false });
      } catch {
        setError("Failed to connect to server");
      } finally {
        setIsLoading(false);
      }
    },
    [
      onBeforeNavigate,
      activateDocument,
    ]
  );

  const dismissError = useCallback(() => setError(null), []);

  const snapshotSession = useCallback((): LinkedDocSessionState => {
    const docs = new Map(docCache.current);
    if (linkedDoc) {
      docs.set(linkedDoc.filepath, {
        annotations: [...annotations],
        globalAttachments: [...globalAttachments],
        markdown: linkedDoc.markdown,
      });
    }

    const root = savedPlanState.current
      ? {
          markdown: savedPlanState.current.markdown,
          annotations: [...savedPlanState.current.annotations],
          selectedAnnotationId: savedPlanState.current.selectedAnnotationId,
          globalAttachments: [...savedPlanState.current.globalAttachments],
        }
      : {
          markdown,
          annotations: [...annotations],
          selectedAnnotationId,
          globalAttachments: [...globalAttachments],
        };

    return { root, docs };
  }, [linkedDoc, annotations, globalAttachments, markdown, selectedAnnotationId]);

  const restoreSession = useCallback((state: LinkedDocSessionState) => {
    viewerRef.current?.clearAllHighlights();

    savedPlanState.current = null;
    docCache.current = new Map(state.docs);
    let total = 0;
    for (const cached of docCache.current.values()) {
      total += cached.annotations.length + cached.globalAttachments.length;
    }
    setDocAnnotationCount(total);

    setMarkdown(state.root.markdown);
    setAnnotations([...state.root.annotations]);
    setGlobalAttachments([...state.root.globalAttachments]);
    setSelectedAnnotationId(state.root.selectedAnnotationId);
    setLinkedDoc(null);
    setError(null);

    if (state.root.annotations.length) {
      setTimeout(() => {
        viewerRef.current?.clearAllHighlights();
        viewerRef.current?.applySharedAnnotations(state.root.annotations);
      }, HIGHLIGHT_REAPPLY_DELAY);
    }
  }, [
    setMarkdown,
    setAnnotations,
    setSelectedAnnotationId,
    setGlobalAttachments,
    viewerRef,
  ]);

  const getDocAnnotations = useCallback((): Map<string, CachedDocState> => {
    const result = new Map(docCache.current);
    // Include stashed original-file annotations when viewing a linked doc
    if (linkedDoc && savedPlanState.current && sourceFilePath) {
      result.set(sourceFilePath, {
        annotations: [...savedPlanState.current.annotations],
        globalAttachments: [...savedPlanState.current.globalAttachments],
        markdown: savedPlanState.current.markdown,
      });
    }
    if (linkedDoc) {
      result.set(linkedDoc.filepath, {
        annotations: [...annotations],
        globalAttachments: [...globalAttachments],
        markdown: linkedDoc.markdown,
      });
    }
    return result;
  }, [linkedDoc, annotations, globalAttachments, sourceFilePath]);

  return {
    isActive: linkedDoc !== null,
    filepath: linkedDoc?.filepath ?? null,
    error,
    isLoading,
    open,
    openLoaded,
    back,
    dismissError,
    getDocAnnotations,
    snapshotSession,
    restoreSession,
    docAnnotationCount,
  };
}
