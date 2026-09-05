/**
 * Compact annotation serialization — read side.
 *
 * The tuple/array wire format below predates the current draft format and is
 * still written into old on-disk drafts, so DRAFT RESTORE depends on these
 * decoders. They used to live in `utils/sharing.ts`; sharing was only one of
 * their transports, and removing it must not take legacy draft recovery with
 * it. This module is that neutral boundary: it decodes, it never fetches, and
 * it owns no transport.
 *
 * The schema is unchanged and deliberately so — this is a move, not a new
 * format. Accepted inputs:
 *  - `a`: `ShareableAnnotation[]` tuples — `['D', …]`, `['C', …]`, `['G', …]`,
 *    with the optional trailing `1` quick-label flag on comments, plus the
 *    parallel `d` (diffContext) and `s` (source) arrays.
 *  - `g` / per-annotation images: `ShareableImage[]`, where each entry is
 *    either a `[path, name]` tuple (newer) or a bare path string (oldest), for
 *    which the name is derived from the filename.
 *
 * Spec 05 (comments and attachments) owns the top-level/global image
 * conversion. Until then these decoders MUST keep returning global
 * attachments and per-annotation images as-is: dropping them here would
 * silently discard images from legacy drafts before 05 can convert them.
 */

import { AnnotationType, type Annotation, type ImageAttachment } from '../types';

// Image in shareable format: plain string (old) or [path, name] tuple (new)
export type ShareableImage = string | [string, string];

// Minimal shareable annotation format: [type, originalText, text?, author?, images?, quickLabel?]
export type ShareableAnnotation =
  | ['D', string, string | null, ShareableImage[]?]                    // Deletion: type, original, author, images
  | ['C', string, string, string | null, ShareableImage[]?, (1)?]      // Comment: type, original, comment, author, images, isQuickLabel
  | ['G', string, string | null, ShareableImage[]?];                   // Global Comment: type, comment, author, images

/**
 * Convert ShareableImage[] to ImageAttachment[] (handles old plain-string format)
 */
export function parseShareableImages(raw: ShareableImage[] | undefined): ImageAttachment[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map(img => {
    if (typeof img === 'string') {
      // Old format: plain path string — derive name from filename
      const name = img.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image';
      return { path: img, name };
    }
    return { path: img[0], name: img[1] };
  });
}

/**
 * Convert shareable format back to full Annotation objects
 * Note: blockId, offsets, and meta will need to be populated separately
 * by finding the text in the rendered document.
 */
export function fromShareable(data: ShareableAnnotation[], diffContexts?: (string | null)[] | null, sources?: (string | undefined)[] | null): Annotation[] {
  const typeMap: Record<string, AnnotationType> = {
    'D': AnnotationType.DELETION,
    'C': AnnotationType.COMMENT,
    'G': AnnotationType.GLOBAL_COMMENT,
  };

  return data.map((item, index) => {
    const type = item[0];

    // Handle global comments specially: ['G', text, author, images?]
    if (type === 'G') {
      const text = item[1] as string;
      const author = item[2] as string | null;
      const rawImages = item[3] as ShareableImage[] | undefined;

      return {
        id: `shared-${index}-${Date.now()}`,
        blockId: '',
        startOffset: 0,
        endOffset: 0,
        type: AnnotationType.GLOBAL_COMMENT,
        text: text || undefined,
        originalText: '',
        createdA: Date.now() + index,
        author: author || undefined,
        images: parseShareableImages(rawImages),
        ...(sources?.[index] ? { source: sources[index] } : {}),
      };
    }

    const originalText = item[1];
    // For deletion: [type, original, author, images?]
    // For others: [type, original, text, author, images?]
    const text = type === 'D' ? undefined : item[2] as string;
    const author = type === 'D' ? item[2] as string | null : item[3] as string | null;
    const rawImages = type === 'D' ? item[3] as ShareableImage[] | undefined : item[4] as ShareableImage[] | undefined;
    // Comment annotations may have isQuickLabel flag at index 5
    const isQuickLabel = type === 'C' && item.length > 5 && item[5] === 1 ? true : undefined;

    return {
      id: `shared-${index}-${Date.now()}`,
      blockId: '',  // Will be populated during highlight restoration
      startOffset: 0,
      endOffset: 0,
      type: typeMap[type],
      text: text || undefined,
      originalText,
      createdA: Date.now() + index,  // Preserve order
      author: author || undefined,
      images: parseShareableImages(rawImages),
      ...(isQuickLabel ? { isQuickLabel } : {}),
      ...(diffContexts?.[index] ? { diffContext: diffContexts[index] as Annotation['diffContext'] } : {}),
      ...(sources?.[index] ? { source: sources[index] } : {}),
      // startMeta/endMeta will be set by web-highlighter
    };
  });
}
