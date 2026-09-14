import type { SelectedLineRange } from '@hypermark/ui/types';

export type { DiffFile, DiffFileStatus } from '@hypermark/core/diff-files';

/** One-shot request to open the native code-annotation composer on a source range. */
export interface LineAnnotationComposeRequest {
  readonly id: number;
  readonly filePath: string;
  readonly range: SelectedLineRange;
}

/**
 * A "scroll the diff to this comment" request, distinct from mere selection so
 * that clicking a comment in the diff (select/highlight) never moves the
 * viewport while a sidebar / findings-list click (navigate) does. The `token`
 * bumps on every navigate so re-selecting the same comment re-fires the scroll.
 */
export interface AnnotationScrollTarget {
  id: string;
  token: number;
}
