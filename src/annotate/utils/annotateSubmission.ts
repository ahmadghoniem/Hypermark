import type {
  Annotation,
  Block,
  ImageAttachment,
} from "@/ui/types";
import {
  exportAnnotations,
  exportMessageAnnotations,
  type MessageAnnotationEntry,
} from "@/ui/utils/parser";

/** What All good sends when there is nothing to send. The launcher skills match its wording. */
const noFeedbackSentence = (subject: string) =>
  `User reviewed the ${subject} and has no feedback.`;

export interface CompleteAnnotateFeedbackInput {
  blocks: Block[];
  annotations: Annotation[];
  /** Legacy, read-only: the host's `globalAttachments` state
      is no longer written to, so this is always empty by the time it
      reaches export — kept only so `exportAnnotations` still decodes an old
      caller that hasn't gone through the restore-time normalizer. */
  globalAttachments: ImageAttachment[];
  title: string;
  subject: string;
  messageEntries?: MessageAnnotationEntry[];
}

export function buildCompleteAnnotateFeedback(
  input: CompleteAnnotateFeedbackInput,
): string {
  let annotationsText: string;

  if (input.messageEntries) {
    annotationsText = exportMessageAnnotations(input.messageEntries);
  } else if (input.annotations.length === 0 && input.globalAttachments.length === 0) {
    annotationsText = noFeedbackSentence(input.subject);
  } else {
    annotationsText = exportAnnotations(
      input.blocks,
      input.annotations,
      input.globalAttachments,
      input.title,
      input.subject,
    );
  }

  return annotationsText;
}

