export enum AnnotationType {
  DELETION = 'DELETION',
  COMMENT = 'COMMENT',
  GLOBAL_COMMENT = 'GLOBAL_COMMENT',
}

export interface ImageAttachment {
  path: string;
  name: string;
}

/** DOM-relative text position used to restore a document annotation selection. */
export interface AnnotationTextMeta {
  parentTagName: string;
  parentIndex: number;
  textOffset: number;
}

export interface Annotation {
  id: string;
  blockId: string; // Legacy - not used with web-highlighter
  startOffset: number; // Legacy
  endOffset: number; // Legacy
  type: AnnotationType;
  text?: string; // For comments
  originalText: string; // The text that was selected
  createdA: number;
  images?: ImageAttachment[]; // Attached images with human-readable names
  mathTargets?: Array<{
    blockId: string;
    tex: string;
    displayMode: boolean;
  }>; // math elements covered by a mixed text+formula selection
  // web-highlighter metadata for cross-element selections
  startMeta?: AnnotationTextMeta;
  endMeta?: AnnotationTextMeta;
}

export type AlertKind = 'note' | 'tip' | 'warning' | 'caution' | 'important';

export interface Block {
  id: string;
  type: 'paragraph' | 'heading' | 'blockquote' | 'list-item' | 'code' | 'hr' | 'table' | 'html' | 'directive' | 'math';
  content: string; // Plain text, or raw (unsanitized) HTML for type === 'html'
  level?: number; // For headings (1-6) or list indentation
  language?: string; // For code blocks (e.g., 'rust', 'typescript')
  checked?: boolean; // For checkbox list items (true = checked, false = unchecked, undefined = not a checkbox)
  ordered?: boolean; // For list items: true when source marker was \d+.
  orderedStart?: number; // For ordered list items: integer parsed from the marker (e.g. 5 for "5.")
  alertKind?: AlertKind; // For blockquotes starting with [!NOTE] / [!TIP] / etc.
  directiveKind?: string; // For directive containers (e.g. ':::note' → 'note')
  order: number; // Sorting order
  startLine: number; // 1-based line number in source
  sourceLineCount?: number; // Number of source lines consumed when it differs from content lines
}
