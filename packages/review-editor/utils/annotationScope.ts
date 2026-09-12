import type { CodeAnnotation, SelectedLineRange } from '@hypermark/ui/types';



/** True when an annotation is file-scoped (whole-file comment, not a line/general one). */
export function isFileScopedAnnotation(a: CodeAnnotation): boolean {
  return (a.scope ?? 'line') === 'file';
}

/**
 * The diff line range an annotation anchors to, as a Pierre `SelectedLineRange`
 * — used to replay a comment's selection as the controlled highlight when it's
 * clicked. Normalizes endpoint order and maps our `'new'|'old'` side to Pierre's
 * `'additions'|'deletions'`. Not meaningful for file-scoped comments (callers
 * skip those via {@link isFileScopedAnnotation}).
 */
export function lineRangeForAnnotation(a: CodeAnnotation): SelectedLineRange {
  return {
    start: Math.min(a.lineStart, a.lineEnd),
    end: Math.max(a.lineStart, a.lineEnd),
    side: a.side === 'new' ? 'additions' : 'deletions',
  };
}
