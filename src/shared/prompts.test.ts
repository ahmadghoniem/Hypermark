import { describe, expect, test } from "bun:test";
import { mergePromptConfig, type PromptRuntime } from "./config";
import {
  DEFAULT_REVIEW_APPROVED_PROMPT,
  DEFAULT_ANNOTATE_FILE_FEEDBACK_PROMPT,
  DEFAULT_ANNOTATE_MESSAGE_FEEDBACK_PROMPT,
  DEFAULT_REVIEW_APPROVED_WITH_NOTES_PROMPT,
  DEFAULT_REVIEW_DENIED_SUFFIX,
  LEGACY_REVIEW_APPROVAL_PLACEHOLDER,
  composeReviewApprovedMessage,
  getReviewApprovedPrompt,
  getAnnotateFileFeedbackTemplate,
  getAnnotateMessageFeedbackTemplate,
  getReviewDeniedSuffix,
  resolveTemplate,
} from "./prompts";

// ─── A1. Template engine ─────────────────────────────────────────────────────

describe("resolveTemplate", () => {
  test("replaces known variables", () => {
    expect(resolveTemplate("Hello {{name}}", { name: "world" }))
      .toBe("Hello world");
  });

  test("leaves unknown {{variables}} as-is", () => {
    expect(resolveTemplate("Hello {{unknown}}", {}))
      .toBe("Hello {{unknown}}");
  });

  test("handles empty vars object", () => {
    expect(resolveTemplate("no vars here", {}))
      .toBe("no vars here");
  });

  test("handles undefined values in vars (leaves placeholder)", () => {
    expect(resolveTemplate("Hello {{name}}", { name: undefined }))
      .toBe("Hello {{name}}");
  });

  test("handles template with no variables", () => {
    expect(resolveTemplate("static text", { name: "ignored" }))
      .toBe("static text");
  });

  test("handles adjacent and repeated variables", () => {
    expect(resolveTemplate("{{a}}{{b}} and {{a}}", { a: "X", b: "Y" }))
      .toBe("XY and X");
  });
});

// Unsubstituted template getters — shipped to the browser via the annotate
// /api/plan payload so clipboard Copy can reproduce the Send Feedback wrap
// (including config overrides) client-side (#1107).
describe("getAnnotateFileFeedbackTemplate / getAnnotateMessageFeedbackTemplate", () => {
  test("returns the default templates with placeholders intact", () => {
    expect(getAnnotateFileFeedbackTemplate("claude-code", {})).toBe(
      DEFAULT_ANNOTATE_FILE_FEEDBACK_PROMPT,
    );
    expect(getAnnotateMessageFeedbackTemplate("claude-code", {})).toBe(
      DEFAULT_ANNOTATE_MESSAGE_FEEDBACK_PROMPT,
    );
    expect(getAnnotateFileFeedbackTemplate("claude-code", {})).toContain("{{feedback}}");
  });

  test("returns configured overrides without variable substitution", () => {
    const config = {
      prompts: {
        annotate: {
          fileFeedback: "Review {{filePath}}: {{feedback}}",
          messageFeedback: "Notes: {{feedback}}",
        },
      },
    };
    expect(getAnnotateFileFeedbackTemplate("claude-code", config)).toBe(
      "Review {{filePath}}: {{feedback}}",
    );
    expect(getAnnotateMessageFeedbackTemplate("claude-code", config)).toBe(
      "Notes: {{feedback}}",
    );
  });

  test("runtime-specific override wins over generic", () => {
    const result = getAnnotateFileFeedbackTemplate("claude-code", {
      prompts: {
        annotate: {
          fileFeedback: "Generic: {{feedback}}",
          runtimes: { "claude-code": { fileFeedback: "Runtime: {{feedback}}" } },
        },
      },
    });
    expect(result).toBe("Runtime: {{feedback}}");
  });
});

// ─── A4b. Review denied suffix ───────────────────────────────────────────────

describe("getReviewDeniedSuffix", () => {
  test("requires verdicts backed by code evidence for every incoming finding", () => {
    expect(DEFAULT_REVIEW_DENIED_SUFFIX).toContain(
      "Inspect every finding against the actual code",
    );
    expect(DEFAULT_REVIEW_DENIED_SUFFIX).toContain(
      "do not assume automated feedback is correct",
    );
    expect(DEFAULT_REVIEW_DENIED_SUFFIX).toContain(
      "Confirmed / Partly / Not a bug / Intended",
    );
    expect(DEFAULT_REVIEW_DENIED_SUFFIX).toContain("with concise code evidence");
    expect(DEFAULT_REVIEW_DENIED_SUFFIX).toContain(
      "introduced by the current changes, was pre-existing, or reflects deliberate scope",
    );
  });

  test("limits review to submitted findings", () => {
    expect(DEFAULT_REVIEW_DENIED_SUFFIX).toContain("Review only the incoming findings");
    expect(DEFAULT_REVIEW_DENIED_SUFFIX).toContain(
      "Do not independently review the rest of the diff or search for issues that were not submitted",
    );
    expect(DEFAULT_REVIEW_DENIED_SUFFIX).not.toMatch(
      /independently review the current diff yourself|start (?:a|an) (?:independent|new) review|surface what it missed|(?:find|search for) additional findings|actively look for/i,
    );
  });

  test("keeps code changes blocked until after discussion", () => {
    expect(DEFAULT_REVIEW_DENIED_SUFFIX).toContain(
      "Do not change any code until we have discussed the verdicts and validated findings",
    );
  });

  test("uses configured override", () => {
    expect(getReviewDeniedSuffix("claude-code", {
      prompts: { review: { denied: "\nFix everything." } },
    })).toBe("\nFix everything.");
  });

  test("runtime-specific override wins over the generic suffix", () => {
    expect(getReviewDeniedSuffix("claude-code", {
      prompts: {
        review: {
          denied: "Generic review suffix.",
          runtimes: { "claude-code": { denied: "Runtime review suffix." } },
        },
      },
    })).toBe("Runtime review suffix.");
  });
});

// ─── A6. Config merge (expanded) ─────────────────────────────────────────────

describe("mergePromptConfig (expanded)", () => {
  test("merges annotate section alongside existing review section", () => {
    const merged = mergePromptConfig(
      { review: { approved: "R" } },
      { annotate: { fileFeedback: "F" } },
    );
    expect(merged?.review?.approved).toBe("R");
    expect(merged?.annotate?.fileFeedback).toBe("F");
  });

  test("merges annotate section", () => {
    const merged = mergePromptConfig(
      { annotate: { approved: "A" } },
      { annotate: { fileFeedback: "F", approvedWithNotes: "N" } },
    );
    expect(merged?.annotate?.approved).toBe("A");
    expect(merged?.annotate?.fileFeedback).toBe("F");
    expect(merged?.annotate?.approvedWithNotes).toBe("N");
  });

});

// ─── Approve-with-notes composition ─────────────────────────

describe("composeReviewApprovedMessage", () => {
  // The one shared composer the review decision consumer emits approvals
  // through. Bare approvals must stay byte-identical to the pre-notes output —
  // the consumer's approved branch depends on it.
  test("bare approvals emit the approved prompt alone", () => {
    expect(composeReviewApprovedMessage("claude-code", undefined, {})).toBe(DEFAULT_REVIEW_APPROVED_PROMPT);
    expect(composeReviewApprovedMessage("claude-code", "", {})).toBe(DEFAULT_REVIEW_APPROVED_PROMPT);
    expect(composeReviewApprovedMessage("claude-code", "  \n ", {})).toBe(DEFAULT_REVIEW_APPROVED_PROMPT);
  });

  // Stage-review M0: the bare prompt says "no changes requested" and the
  // feedback export opens with its own change-request-shaped heading, so
  // naive concatenation reads as a contradiction — the agent starts fixing
  // post-approval or discards the guidance. Notes must land inside the
  // approved-WITH-NOTES template, which frames them as non-blocking.
  test("approve-time feedback is delivered in the with-notes framing, not appended to the bare prompt", () => {
    const note = "Rename the flag before merging.";
    const message = composeReviewApprovedMessage("claude-code", note, {});
    expect(message).toBe(
      resolveTemplate(DEFAULT_REVIEW_APPROVED_WITH_NOTES_PROMPT, { feedback: note }),
    );
    expect(message).toContain(note);
    expect(message).not.toContain("{{feedback}}");
    expect(message).not.toBe(`${DEFAULT_REVIEW_APPROVED_PROMPT}\n\n${note}`);
  });

  test("prompts.review.approvedWithNotes overrides the framing template", () => {
    expect(
      composeReviewApprovedMessage("claude-code", "the note", {
        prompts: { review: { approvedWithNotes: "APPROVED. Notes: {{feedback}}" } },
      }),
    ).toBe("APPROVED. Notes: the note");
  });

  // Compatibility (new consumer / old built client): older clients sent
  // this exact placeholder on every approval; framing it as reviewer guidance
  // would add filler the reviewer never wrote to every mixed-build approval.
  test("the legacy LGTM placeholder is filtered, never framed as guidance", () => {
    expect(
      composeReviewApprovedMessage("claude-code", LEGACY_REVIEW_APPROVAL_PLACEHOLDER, {}),
    ).toBe(DEFAULT_REVIEW_APPROVED_PROMPT);
  });
});

// ─── Existing review prompt tests (preserved from PR #561) ───────────────────

describe("prompts", () => {
  test("falls back to built-in default when no config is present", () => {
    expect(getReviewApprovedPrompt("claude-code", {})).toBe(DEFAULT_REVIEW_APPROVED_PROMPT);
  });

  test("uses generic configured review approval prompt", () => {
    expect(
      getReviewApprovedPrompt("claude-code", {
        prompts: { review: { approved: "Commit these changes now." } },
      }),
    ).toBe("Commit these changes now.");
  });

  test("runtime-specific review approval prompt wins over generic prompt", () => {
    expect(
      getReviewApprovedPrompt("claude-code", {
        prompts: {
          review: {
            approved: "Generic approval.",
            runtimes: {
              "claude-code": { approved: "Claude-Code-specific approval." },
            },
          },
        },
      }),
    ).toBe("Claude-Code-specific approval.");
  });

  test("blank prompt values fall back to the next available default", () => {
    expect(
      getReviewApprovedPrompt("claude-code", {
        prompts: {
          review: {
            approved: "   ",
            runtimes: {
              "claude-code": { approved: "" },
            },
          },
        },
      }),
    ).toBe(DEFAULT_REVIEW_APPROVED_PROMPT);
  });
});
