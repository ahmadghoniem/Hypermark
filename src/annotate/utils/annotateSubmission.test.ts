import { describe, expect, test } from "bun:test";
import { AnnotationType, type Annotation } from "@/ui/types";
import { parseMarkdownToBlocks } from "@/ui/utils/parser";
import {
  buildCompleteAnnotateFeedback,
} from "./annotateSubmission";

describe("annotate feedback submission", () => {
  test("composes every annotate feedback source into the feedback", () => {
    const markdown = "# Retry\n\nRetry forever.";
    const blocks = parseMarkdownToBlocks(markdown);
    const paragraph = blocks.find((block) => block.type === "paragraph");
    if (!paragraph) throw new Error("expected paragraph block");

    const annotation: Annotation = {
      id: "a1",
      blockId: paragraph.id,
      startOffset: 0,
      endOffset: 5,
      type: AnnotationType.COMMENT,
      text: "Keep the retry bounded.",
      originalText: "Retry",
      createdA: 1,
      images: [{ path: "/tmp/retry.png", name: "retry-diagram" }],
    };
    // A "global reference image" is comment-owned — an
    // image-only GLOBAL_COMMENT annotation — not a parallel top-level list.
    const globalImageAnnotation: Annotation = {
      id: "global-attachments",
      blockId: "",
      startOffset: 0,
      endOffset: 0,
      type: AnnotationType.GLOBAL_COMMENT,
      originalText: "",
      createdA: 1,
      images: [{ path: "/tmp/global.png", name: "global-reference" }],
    };
    const feedback = buildCompleteAnnotateFeedback({
      blocks,
      annotations: [annotation, globalImageAnnotation],
      // Always empty now — no writer populates this parallel list any more.
      globalAttachments: [],
      title: "File Feedback",
      subject: "file",
    });

    expect(feedback).toContain("retry-diagram");
    expect(feedback).toContain("global-reference");
    expect(feedback).not.toContain("Reference Images");
  });
});
