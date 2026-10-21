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
  diffContext?: 'added' | 'removed' | 'modified'; // set when annotation created in plan diff view
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

export interface DiffResult {
  original: string;
  modified: string;
  diffText: string;
}

// Code annotation types
export type CodeAnnotationType = 'comment';
// 'general' is a review-level comment tied to no file and no line. For 'general'
// (and the file-less case) filePath is "" and lineStart/lineEnd are 0 — consumers
// must branch on scope, never read those sentinels as a real path or row.
export type CodeAnnotationScope = 'line' | 'file' | 'general';


export interface CodeAnnotation {
  id: string;
  type: CodeAnnotationType;
  scope?: CodeAnnotationScope; // Defaults to 'line' for backward compatibility
  filePath: string;
  lineStart: number;
  lineEnd: number;
  side: 'old' | 'new';
  text?: string;
  images?: ImageAttachment[];
  charStart?: number; // Character offset within lineStart (token-level selection)
  charEnd?: number; // Character offset within lineEnd (token-level selection)
  tokenText?: string; // Selected token/span text (token-level selection)
  createdAt: number;
  severity?: 'important' | 'nit' | 'pre_existing'; // Agent review severity (Claude)
  reasoning?: string; // Validation chain — how the issue was confirmed (Claude)
  /** Set when the annotation was created on a commit:<sha> diff (Commits
   *  panel). Line numbers anchor to THAT commit's diff-vs-parent — the export
   *  labels the annotation with its commit when sent from any other diff, so
   *  the agent never reads historical line numbers against the current diff. */
  commitSha?: string;
  /** The commit's one-line subject, captured for readable export labels. */
  commitSubject?: string;
}

export interface VaultNode {
  name: string;
  path: string; // relative path within vault
  type: "file" | "folder";
  children?: VaultNode[];
}
