import { loadConfig, type HypermarkConfig, type PromptRuntime } from "./config";

// ─── Template engine ─────────────────────────────────────────────────────────

export function resolveTemplate(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars[key];
    return val !== undefined ? val : match;
  });
}

// ─── Default constants ───────────────────────────────────────────────────────

export const DEFAULT_REVIEW_APPROVED_PROMPT = "# Code Review\n\nCode review completed — no changes requested.";

export const DEFAULT_REVIEW_APPROVED_WITH_NOTES_PROMPT =
  "# Code Review — Approved with Notes\n\nCode review completed — the changes are approved. The notes below are non-blocking guidance, not a request for another revision.\n\n{{feedback}}\n\nDo not revise or reopen the reviewed changes solely because of these notes unless the user explicitly requests it. Carry them into subsequent work where applicable.";

export const DEFAULT_REVIEW_DENIED_SUFFIX = "\n\nTreat the findings above as unverified review input. Inspect every finding against the actual code; do not assume automated feedback is correct. For each finding, give a clear verdict (Confirmed / Partly / Not a bug / Intended) with concise code evidence. Say whether it was introduced by the current changes, was pre-existing, or reflects deliberate scope.\n\nReview only the incoming findings. Do not independently review the rest of the diff or search for issues that were not submitted.\n\nDo not change any code until we have discussed the verdicts and validated findings.";

export const DEFAULT_ANNOTATE_FILE_FEEDBACK_PROMPT =
  "# Markdown Annotations\n\n{{fileHeader}}: {{filePath}}\n\n{{feedback}}\n\nPlease address the annotation feedback above.";

export const DEFAULT_ANNOTATE_MESSAGE_FEEDBACK_PROMPT =
  "# Message Annotations\n\n{{feedback}}\n\nPlease address the annotation feedback above.";

// ─── Core resolver ───────────────────────────────────────────────────────────

type PromptSection = "review" | "annotate";
type PromptKey = "approved" | "approvedWithNotes" | "denied"
  | "fileFeedback" | "messageFeedback";

interface PromptLookupOptions {
  section: PromptSection;
  key: PromptKey;
  runtime?: PromptRuntime | null;
  config?: HypermarkConfig;
  fallback: string;
  runtimeFallbacks?: Partial<Record<PromptRuntime, string>>;
}

function normalizePrompt(prompt: unknown): string | undefined {
  if (typeof prompt !== "string") return undefined;
  return prompt.trim() ? prompt : undefined;
}

export function getConfiguredPrompt(options: PromptLookupOptions): string {
  const resolvedConfig = options.config ?? loadConfig();
  const section = resolvedConfig.prompts?.[options.section];
  const runtimePrompt = options.runtime
    ? normalizePrompt(section?.runtimes?.[options.runtime]?.[options.key])
    : undefined;
  const genericPrompt = normalizePrompt(section?.[options.key]);
  const runtimeFallback = options.runtime
    ? options.runtimeFallbacks?.[options.runtime]
    : undefined;

  return runtimePrompt ?? genericPrompt ?? runtimeFallback ?? options.fallback;
}

type FeedbackVars = Record<string, string | undefined>;

// ─── Review wrappers ─────────────────────────────────────────────────────────

export function getReviewApprovedPrompt(
  runtime?: PromptRuntime | null,
  config?: HypermarkConfig,
): string {
  return getConfiguredPrompt({
    section: "review",
    key: "approved",
    runtime,
    config,
    fallback: DEFAULT_REVIEW_APPROVED_PROMPT,
  });
}

/**
 * The exact placeholder older review clients sent on approve
 * (`src/review/App.tsx` `handleApprove`, removed in the same
 * change that taught consumers to print approve-time feedback). Compatibility
 * guard: a NEW consumer reading a decision produced by an OLD built client
 * (stale bundled HTML against a newer binary) must not frame this filler as
 * reviewer guidance — it was never reviewer-authored content.
 */
export const LEGACY_REVIEW_APPROVAL_PLACEHOLDER = "LGTM - no changes requested.";

export function getReviewApprovedWithNotesPrompt(
  runtime?: PromptRuntime | null,
  config?: HypermarkConfig,
  vars?: FeedbackVars,
): string {
  const template = getConfiguredPrompt({
    section: "review",
    key: "approvedWithNotes",
    runtime,
    config,
    fallback: DEFAULT_REVIEW_APPROVED_WITH_NOTES_PROMPT,
  });
  return vars ? resolveTemplate(template, vars) : template;
}

/**
 * The one shared composer the review decision consumer emits approvals
 * through. A bare approval is the plain approved prompt. An approval carrying
 * feedback uses the approved-WITH-NOTES template (`prompts.review.approvedWithNotes`
 * configurable, default `DEFAULT_REVIEW_APPROVED_WITH_NOTES_PROMPT`): the
 * bare prompt says "no changes requested" and the feedback export opens with
 * its own change-request-shaped heading, so naive concatenation reads as a
 * contradiction — the agent either starts fixing post-approval or discards
 * the guidance. The framing states the notes are non-blocking.
 */
export function composeReviewApprovedMessage(
  runtime?: PromptRuntime | null,
  feedback?: string | null,
  config?: HypermarkConfig,
): string {
  const note = typeof feedback === "string" ? feedback.trim() : "";
  if (!note || note === LEGACY_REVIEW_APPROVAL_PLACEHOLDER) {
    return getReviewApprovedPrompt(runtime, config);
  }
  return getReviewApprovedWithNotesPrompt(runtime, config, { feedback: note });
}

export function getReviewDeniedSuffix(
  runtime?: PromptRuntime | null,
  config?: HypermarkConfig,
): string {
  // Intentionally no per-runtime defaults: every agent gets the same
  // verification-only instruction so none of them start coding off raw review
  // feedback. Per-runtime customization stays available via config
  // (prompts.review.runtimes.<runtime>.denied).
  return getConfiguredPrompt({
    section: "review",
    key: "denied",
    runtime,
    config,
    fallback: DEFAULT_REVIEW_DENIED_SUFFIX,
  });
}

// ─── Annotate wrappers ──────────────────────────────────────────────────────

/**
 * The resolved annotate file-feedback template WITHOUT variable substitution
 * (placeholders like {{feedback}} intact). Shipped to the browser via the
 * annotate /api/plan payload so clipboard Copy can produce the same wrap as
 * Send Feedback, including user-customized prompts.annotate.fileFeedback.
 */
export function getAnnotateFileFeedbackTemplate(
  runtime?: PromptRuntime | null,
  config?: HypermarkConfig,
): string {
  return getConfiguredPrompt({
    section: "annotate",
    key: "fileFeedback",
    runtime,
    config,
    fallback: DEFAULT_ANNOTATE_FILE_FEEDBACK_PROMPT,
  });
}

/** Message-annotate counterpart of getAnnotateFileFeedbackTemplate(). */
export function getAnnotateMessageFeedbackTemplate(
  runtime?: PromptRuntime | null,
  config?: HypermarkConfig,
): string {
  return getConfiguredPrompt({
    section: "annotate",
    key: "messageFeedback",
    runtime,
    config,
    fallback: DEFAULT_ANNOTATE_MESSAGE_FEEDBACK_PROMPT,
  });
}
