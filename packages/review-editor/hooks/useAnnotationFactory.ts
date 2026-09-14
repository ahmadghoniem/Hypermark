import { useMemo, useCallback } from 'react';
import type { CodeAnnotation } from '@hypermark/ui/types';

/** The active commit diff, if any — stamped onto annotations created while a
 *  commit:<sha> diff is on screen. An in-place context switch (diff-type switch)
 *  can't silently re-anchor old annotations to a diff they weren't made on. */
export interface CommitAnnotationContext {
  sha: string;
  subject?: string;
}

export function useAnnotationFactory(
  commitContext?: CommitAnnotationContext | null,
) {
  const diffContext = useMemo(() => ({
    ...(commitContext ? {
      commitSha: commitContext.sha,
      ...(commitContext.subject ? { commitSubject: commitContext.subject } : {}),
    } : {}),
  }), [commitContext]);

  const withDiffContext = useCallback(
    (annotation: CodeAnnotation): CodeAnnotation => ({ ...annotation, ...diffContext }),
    [diffContext],
  );

  return { withDiffContext };
}
