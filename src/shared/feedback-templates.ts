/**
 * Shared feedback templates for the annotate integrations.
 *
 * IMPORTANT: This module is imported by src/ui/utils/parser.ts which is
 * bundled into the browser SPA. It must NOT import from ./prompts or ./config
 * (which depend on node:fs, node:os, node:child_process). Keep it self-contained.
 *
 * This module backs the browser's clipboard copy features
 * (wrapFeedbackForClipboard).
 */

export interface AnnotateFileFeedbackOptions {
  filePath: string;
  fileHeader?: "File" | "Folder" | string;
}

export const annotateFileFeedback = (
  feedback: string,
  options: AnnotateFileFeedbackOptions,
): string => {
  const fileHeader = options.fileHeader ?? "File";
  return `# Markdown Annotations\n\n${fileHeader}: ${options.filePath}\n\n${feedback}\n\nPlease address the annotation feedback above.`;
};

export const annotateMessageFeedback = (feedback: string): string =>
  `# Message Annotations\n\n${feedback}\n\nPlease address the annotation feedback above.`;

/**
 * Browser-safe `{{placeholder}}` substitution with the same semantics as
 * resolveTemplate() in @hypermark/shared/prompts: unknown placeholders are
 * left untouched. Used by the clipboard copy paths to apply a server-resolved
 * feedback template without any node: imports.
 */
export const applyFeedbackTemplate = (
  template: string,
  vars: Record<string, string | undefined>,
): string =>
  template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars[key];
    return val !== undefined ? val : match;
  });

/**
 * Resolved (config-aware, unsubstituted) feedback templates shipped by the
 * annotate server in the /api/plan payload. Absent outside annotate mode.
 */
export interface AnnotateFeedbackTemplates {
  /** File/folder annotate wrap — placeholders: {{feedback}}, {{filePath}}, {{fileHeader}}. */
  fileFeedback?: string;
  /** Message annotate wrap (annotate-last) — placeholder: {{feedback}}. */
  messageFeedback?: string;
}

export type ClipboardFeedbackContext =
  | { mode: "annotate-file"; template?: string; filePath: string; fileHeader?: string }
  | { mode: "annotate-message"; template?: string };

/**
 * Mode-aware wrapper for the clipboard Copy paths (#1107).
 *
 * Uses the server-resolved template when the server shipped one (matching
 * what Send Feedback produces, including user-customized prompts.annotate.*
 * templates in ~/.hypermark/config.json), and falls back to the built-in
 * annotate defaults when it did not.
 */
export const wrapFeedbackForClipboard = (
  feedback: string,
  context: ClipboardFeedbackContext,
): string => {
  if (context.mode === "annotate-file") {
    if (context.template) {
      return applyFeedbackTemplate(context.template, {
        feedback,
        filePath: context.filePath,
        fileHeader: context.fileHeader ?? "File",
      });
    }
    return annotateFileFeedback(feedback, {
      filePath: context.filePath,
      fileHeader: context.fileHeader,
    });
  }
  if (context.template) {
    return applyFeedbackTemplate(context.template, { feedback });
  }
  return annotateMessageFeedback(feedback);
};
