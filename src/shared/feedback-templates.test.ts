import { describe, test, expect } from "bun:test";
import {
  annotateFileFeedback,
  annotateMessageFeedback,
  applyFeedbackTemplate,
  wrapFeedbackForClipboard,
} from "./feedback-templates";

describe("feedback-templates", () => {
  test("annotate file feedback mirrors the runtime file prompt shape", () => {
    const result = annotateFileFeedback("Fix the intro", {
      fileHeader: "File",
      filePath: "/repo/README.md",
    });

    expect(result).toContain("# Markdown Annotations");
    expect(result).toContain("File: /repo/README.md");
    expect(result).toContain("Fix the intro");
    expect(result).toContain("Please address the annotation feedback above.");
  });

  test("annotate message feedback mirrors the runtime message prompt shape", () => {
    const result = annotateMessageFeedback("Wrong conclusion");

    expect(result).toContain("# Message Annotations");
    expect(result).toContain("Wrong conclusion");
    expect(result).toContain("Please address the annotation feedback above.");
  });

});

describe("applyFeedbackTemplate", () => {
  test("substitutes known placeholders", () => {
    const result = applyFeedbackTemplate("Review {{filePath}}: {{feedback}}", {
      filePath: "/repo/README.md",
      feedback: "Fix the intro",
    });
    expect(result).toBe("Review /repo/README.md: Fix the intro");
  });

  test("leaves unknown placeholders untouched (resolveTemplate parity)", () => {
    const result = applyFeedbackTemplate("{{feedback}} {{mystery}}", {
      feedback: "hi",
    });
    expect(result).toBe("hi {{mystery}}");
  });
});

/**
 * Clipboard copy wrapping (#1107): Copy must match what Send Feedback produces.
 */
describe("wrapFeedbackForClipboard", () => {
  test("annotate-file without a server template uses the default annotate wrap", () => {
    const result = wrapFeedbackForClipboard("Fix the intro", {
      mode: "annotate-file",
      filePath: "/repo/README.md",
      fileHeader: "File",
    });
    expect(result).toBe(
      annotateFileFeedback("Fix the intro", { filePath: "/repo/README.md", fileHeader: "File" }),
    );
  });

  test("annotate-file applies the server-resolved template with substitution", () => {
    const result = wrapFeedbackForClipboard("Fix the intro", {
      mode: "annotate-file",
      template: "{{fileHeader}} {{filePath}} notes:\n\n{{feedback}}\n\nAnswer questions directly.",
      filePath: "/repo/README.md",
      fileHeader: "File",
    });
    expect(result).toBe(
      "File /repo/README.md notes:\n\nFix the intro\n\nAnswer questions directly.",
    );
  });

  test("annotate-file defaults fileHeader to File when the template needs it", () => {
    const result = wrapFeedbackForClipboard("Fix it", {
      mode: "annotate-file",
      template: "{{fileHeader}}: {{filePath}} — {{feedback}}",
      filePath: "/repo/doc.md",
    });
    expect(result).toBe("File: /repo/doc.md — Fix it");
  });

  test("annotate-message without a server template uses the default message wrap", () => {
    const result = wrapFeedbackForClipboard("Wrong conclusion", { mode: "annotate-message" });
    expect(result).toBe(annotateMessageFeedback("Wrong conclusion"));
  });

  test("annotate-message applies the server-resolved template with substitution", () => {
    const result = wrapFeedbackForClipboard("Wrong conclusion", {
      mode: "annotate-message",
      template: "Message review:\n\n{{feedback}}",
    });
    expect(result).toBe("Message review:\n\nWrong conclusion");
  });
});
