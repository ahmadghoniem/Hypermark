/**
 * Attachment Normalization & Legacy Compatibility Layer
 *
 * Spec 05 (§4.1) mandates migrating from parallel top-level/global attachment
 * lists to comment-owned attachments, while strictly preserving backward
 * compatibility for legacy readers and persisted formats.
 *
 * This module provides pure normalizer functions that:
 * 1. Convert legacy tuple `g` and top-level `globalAttachments` into one
 *    image-only `GLOBAL_COMMENT` per owning document or message.
 * 2. Guarantee idempotence across repeated saves, restores, and re-renders.
 * 3. Handle ambiguous/unanchored images explicitly without inventing false
 *    anchors or discarding user content.
 * 4. Respect draft generation and tombstone contracts (empty remains empty,
 *    preventing ghost draft resurrection).
 */

import { AnnotationType, type Annotation, type CodeAnnotation, type ImageAttachment } from '../types';
import {
  fromShareable,
  parseShareableImages,
  type ShareableAnnotation,
} from './annotationSerialization';

/**
 * Normalizes an arbitrary image representation into a canonical ImageAttachment.
 *
 * Supports:
 * - `ImageAttachment` objects: `{ path, name }`
 * - `ShareableImage` tuples: `[path, name]`
 * - Bare path strings: `'/path/to/image.png'` (name is derived from filename)
 *
 * Returns null for malformed, empty, or un-resolvable inputs.
 */
export function normalizeAttachmentImage(input: unknown): ImageAttachment | null {
  if (!input) return null;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const name = trimmed.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image';
    return { path: trimmed, name };
  }

  if (Array.isArray(input)) {
    if (input.length >= 2 && typeof input[0] === 'string' && typeof input[1] === 'string') {
      const path = input[0].trim();
      const name = input[1].trim();
      if (!path) return null;
      return { path, name: name || path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image' };
    }
    if (input.length === 1 && typeof input[0] === 'string') {
      return normalizeAttachmentImage(input[0]);
    }
    return null;
  }

  if (typeof input === 'object' && 'path' in input && typeof (input as { path: unknown }).path === 'string') {
    const rawPath = (input as { path: string }).path;
    const path = rawPath.trim();
    if (!path) return null;
    const rawName = (input as { name?: unknown }).name;
    let name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!name) {
      name = path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image';
    }
    return { path, name };
  }

  return null;
}

/**
 * Normalizes an array of arbitrary image representations into a deduplicated list
 * of canonical ImageAttachment objects, preserving order of first appearance.
 */
export function normalizeAttachmentImages(inputs: unknown): ImageAttachment[] {
  if (!Array.isArray(inputs) || inputs.length === 0) return [];

  const seenPaths = new Set<string>();
  const results: ImageAttachment[] = [];

  for (const item of inputs) {
    const normalized = normalizeAttachmentImage(item);
    if (normalized && !seenPaths.has(normalized.path)) {
      seenPaths.add(normalized.path);
      results.push(normalized);
    }
  }

  return results;
}

/**
 * Builds a deterministic annotation ID for the document-level GLOBAL_COMMENT that
 * owns migrated global attachments.
 *
 * Determinism is essential: re-running normalization across restore/save retries
 * must identify and reuse the same comment rather than minting random IDs.
 */
export function buildGlobalAttachmentCommentId(docKey?: string | null): string {
  if (!docKey) return 'global-attachments';
  const sanitized = docKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `global-attachments-${sanitized}`;
}

export interface NormalizeDocumentOptions {
  annotations?: Annotation[];
  globalAttachments?: unknown[];
  docKey?: string | null;
  author?: string;
  createdA?: number;
}

export interface NormalizedDocumentResult {
  annotations: Annotation[];
  globalAttachments: ImageAttachment[];
}

/**
 * Normalizes annotations and legacy global attachments for a single document.
 *
 * Decision rationale for ambiguous global images (Spec 05 §4.1):
 * Legacy global attachments do not carry line anchors or comment associations.
 * Attaching them to an arbitrary line comment would invent false semantic
 * associations. Therefore, all unassociated global attachments are deterministically
 * converted into one image-only `GLOBAL_COMMENT` per document. If an image is
 * already owned by a specific comment, it is not duplicated into the global comment.
 */
export function normalizeDocumentAnnotations({
  annotations = [],
  globalAttachments = [],
  docKey,
  author,
  createdA,
}: NormalizeDocumentOptions): NormalizedDocumentResult {
  const normalizedGlobals = normalizeAttachmentImages(globalAttachments);

  // If there are no global images to migrate, return annotations as-is with empty globalAttachments
  if (normalizedGlobals.length === 0) {
    return {
      annotations: [...annotations],
      globalAttachments: [],
    };
  }

  const globalCommentId = buildGlobalAttachmentCommentId(docKey);

  // Identify any existing global comment container
  const existingGlobalIndex = annotations.findIndex(
    (a) => a.id === globalCommentId || (a.type === AnnotationType.GLOBAL_COMMENT && a.id.startsWith('global-attachments')),
  );

  // Collect image paths already attached across all annotations to prevent duplication
  const existingImagePaths = new Set<string>();
  for (const ann of annotations) {
    if (ann.images) {
      for (const img of ann.images) {
        existingImagePaths.add(img.path);
      }
    }
  }

  // Filter out images that are already present in existing comments
  const imagesToAdd: ImageAttachment[] = [];
  for (const img of normalizedGlobals) {
    if (existingGlobalIndex >= 0) {
      const currentGlobalImages = annotations[existingGlobalIndex].images || [];
      const inCurrentGlobal = currentGlobalImages.some((existing) => existing.path === img.path);
      if (!inCurrentGlobal) {
        imagesToAdd.push(img);
      }
    } else if (!existingImagePaths.has(img.path)) {
      imagesToAdd.push(img);
    }
  }

  // If all images were already present, nothing to add or modify
  if (existingGlobalIndex < 0 && imagesToAdd.length === 0) {
    return {
      annotations: [...annotations],
      globalAttachments: [],
    };
  }

  const updatedAnnotations = [...annotations];

  if (existingGlobalIndex >= 0) {
    const existing = updatedAnnotations[existingGlobalIndex];
    const combinedImages = normalizeAttachmentImages([...(existing.images || []), ...imagesToAdd]);
    updatedAnnotations[existingGlobalIndex] = {
      ...existing,
      images: combinedImages,
    };
  } else {
    const newGlobalComment: Annotation = {
      id: globalCommentId,
      blockId: '',
      startOffset: 0,
      endOffset: 0,
      type: AnnotationType.GLOBAL_COMMENT,
      originalText: '',
      createdA: createdA ?? Date.now(),
      ...(author ? { author } : {}),
      images: imagesToAdd,
    };
    updatedAnnotations.push(newGlobalComment);
  }

  return {
    annotations: updatedAnnotations,
    globalAttachments: [],
  };
}

export interface NormalizedDraftResult {
  annotations: Annotation[];
  codeAnnotations: CodeAnnotation[];
  globalAttachments: ImageAttachment[];
  draftGeneration?: number;
  ts?: number;
}

/**
 * Normalizes an entire draft payload (legacy tuple-based or modern object-based)
 * into the comment-owned attachment model.
 *
 * Tombstone safety:
 * When all annotation and attachment lists are empty, the normalizer preserves
 * that emptiness without inventing a blank GLOBAL_COMMENT. This ensures the
 * draft-delete tombstone check in `useAnnotationDraft` correctly detects when
 * a draft has been completely discarded.
 */
export function normalizeDraftPayload(data: unknown, docKey?: string): NormalizedDraftResult | null {
  if (!data || typeof data !== 'object') return null;

  // Legacy draft: { a: ShareableAnnotation[], g?: ShareableImage[], d?: string[], ts: number }
  if ('a' in data && Array.isArray((data as { a: unknown }).a)) {
    const legacy = data as { a: ShareableAnnotation[]; g?: unknown[]; d?: (string | null)[]; ts?: number };
    const decodedAnns = legacy.a.length > 0 ? fromShareable(legacy.a, legacy.d) : [];
    const decodedGlobals = legacy.g ? (parseShareableImages(legacy.g as Parameters<typeof parseShareableImages>[0]) ?? []) : [];

    const { annotations } = normalizeDocumentAnnotations({
      annotations: decodedAnns,
      globalAttachments: decodedGlobals,
      docKey,
    });

    return {
      annotations,
      codeAnnotations: [],
      globalAttachments: [],
      ts: legacy.ts,
    };
  }

  // Modern draft: { annotations?: Annotation[], codeAnnotations?: CodeAnnotation[], globalAttachments?: ImageAttachment[], draftGeneration?: number, ts?: number }
  const modern = data as {
    annotations?: Annotation[];
    codeAnnotations?: CodeAnnotation[];
    globalAttachments?: unknown[];
    draftGeneration?: number;
    ts?: number;
  };

  const rawAnns = Array.isArray(modern.annotations) ? modern.annotations : [];
  const rawCodeAnns = Array.isArray(modern.codeAnnotations) ? modern.codeAnnotations : [];
  const rawGlobals = Array.isArray(modern.globalAttachments) ? modern.globalAttachments : [];

  const { annotations } = normalizeDocumentAnnotations({
    annotations: rawAnns,
    globalAttachments: rawGlobals,
    docKey,
  });

  return {
    annotations,
    codeAnnotations: rawCodeAnns,
    globalAttachments: [],
    ...(modern.draftGeneration !== undefined ? { draftGeneration: modern.draftGeneration } : {}),
    ...(modern.ts !== undefined ? { ts: modern.ts } : {}),
  };
}
