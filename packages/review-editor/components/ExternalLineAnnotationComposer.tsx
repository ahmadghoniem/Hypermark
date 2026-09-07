import React, { useCallback, useEffect, useRef } from 'react';
import type {
  CodeAnnotationType,
  ConventionalDecoration,
  ConventionalLabel,
  ImageAttachment,
  SelectedLineRange,
  TokenAnnotationMeta,
} from '@plannotator/ui/types';
import type { DiffFile } from '../types';
import type {
  LineAnnotationComposeRequest,
  ReviewState,
} from '../dock/ReviewStateContext';
import { ToolbarHost, type ToolbarHostHandle } from './ToolbarHost';

interface ExternalLineAnnotationComposerProps {
  readonly request: LineAnnotationComposeRequest;
  readonly file: DiffFile;
  readonly onLineSelection: ReviewState['onLineSelection'];
  readonly onAddAnnotationForFile: ReviewState['onAddAnnotationForFile'];
  readonly onEditAnnotation: ReviewState['onEditAnnotation'];
}

/**
 * Hosts the ordinary code-review ToolbarHost for a source selection made on a
 * non-diff surface. The resulting annotation follows the exact same draft,
 * sidebar, feedback-export, and hosted-review path as a Pierre line selection.
 */
export function ExternalLineAnnotationComposer({
  request,
  file,
  onLineSelection,
  onAddAnnotationForFile,
  onEditAnnotation,
}: ExternalLineAnnotationComposerProps) {
  const toolbarRef = useRef<ToolbarHostHandle>(null);

  useEffect(() => {
    toolbarRef.current?.openLineAnnotation(request.range);
  }, [request.id, request.range]);

  const addAnnotation = useCallback((
    type: CodeAnnotationType,
    text?: string,
    suggestedCode?: string,
    originalCode?: string,
    conventionalLabel?: ConventionalLabel,
    decorations?: ConventionalDecoration[],
    tokenMeta?: TokenAnnotationMeta,
    images?: ImageAttachment[],
  ) => {
    onAddAnnotationForFile(
      file.path,
      type,
      text,
      suggestedCode,
      originalCode,
      conventionalLabel,
      decorations,
      tokenMeta,
      images,
    );
  }, [file.path, onAddAnnotationForFile]);

  return (
    <ToolbarHost
      ref={toolbarRef}
      patch={file.patch}
      filePath={file.path}
      isFocused
      onLineSelection={onLineSelection}
      onAddAnnotation={addAnnotation}
      onEditAnnotation={onEditAnnotation}
    />
  );
}
