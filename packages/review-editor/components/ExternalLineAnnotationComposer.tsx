import React, { useCallback, useEffect, useRef } from 'react';
import type {
  CodeAnnotationType,
  ImageAttachment,
  SelectedLineRange,
  TokenAnnotationMeta,
} from '@hypermark/ui/types';
import type { DiffFile, LineAnnotationComposeRequest } from '../types';
import { ToolbarHost, type ToolbarHostHandle } from './ToolbarHost';

interface ExternalLineAnnotationComposerProps {
  readonly request: LineAnnotationComposeRequest;
  readonly file: DiffFile;
  readonly onLineSelection: (range: SelectedLineRange | null) => void;
  readonly onAddAnnotationForFile: (
    filePath: string,
    type: CodeAnnotationType,
    text?: string,
    tokenMeta?: TokenAnnotationMeta,
    images?: ImageAttachment[],
  ) => void;
  readonly onEditAnnotation: (id: string, text?: string, images?: ImageAttachment[]) => void;
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
    tokenMeta?: TokenAnnotationMeta,
    images?: ImageAttachment[],
  ) => {
    onAddAnnotationForFile(file.path, type, text, tokenMeta, images);
  }, [file.path, onAddAnnotationForFile]);

  return (
    <ToolbarHost
      ref={toolbarRef}
      filePath={file.path}
      isFocused
      onLineSelection={onLineSelection}
      onAddAnnotation={addAnnotation}
      onEditAnnotation={onEditAnnotation}
    />
  );
}
