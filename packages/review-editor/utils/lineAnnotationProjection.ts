import type { CodeAnnotation, DiffAnnotationMetadata } from '@hypermark/ui/types';
import type { DiffLineAnnotation } from '@pierre/diffs';
import { annotationMatchesPrScope } from './annotationScope';
import { lineAnnotationMetadata } from './annotationDisplay';

/**
 * Project a file's LINE annotations into Pierre's `DiffLineAnnotation` shape.
 *
 * One entry per line the comment covers, so a multi-line comment carries a
 * gutter marker on every line of its range rather than only on `lineEnd`
 * (spec 05 §4.3.5). File-scoped comments are deliberately excluded — they
 * render in the file header, not the gutter.
 *
 * Lives outside the component so it can be tested without importing the
 * virtualized view (and, with it, Pierre's worker bundle).
 */
export function projectFileAnnotations(
  annotations: CodeAnnotation[],
  filePath: string,
  prUrl: string | undefined,
  prDiffScope: string | undefined,
): DiffLineAnnotation<DiffAnnotationMetadata>[] {
  return annotations
    .filter(
      (a) =>
        a.filePath === filePath &&
        (a.scope ?? 'line') === 'line' &&
        annotationMatchesPrScope(a, prUrl, prDiffScope),
    )
    .flatMap((ann) => {
      // One entry per covered line, not only `lineEnd` (spec 05 §4.3.5), so a
      // multi-line comment is reachable from anywhere in its range.
      const side = ann.side === 'new' ? ('additions' as const) : ('deletions' as const);
      const metadata = lineAnnotationMetadata(ann);
      const start = Math.min(ann.lineStart ?? ann.lineEnd, ann.lineEnd);
      const entries: DiffLineAnnotation<DiffAnnotationMetadata>[] = [];
      for (let line = start; line <= ann.lineEnd; line += 1) {
        entries.push({ side, lineNumber: line, metadata });
      }
      return entries;
    });
}
