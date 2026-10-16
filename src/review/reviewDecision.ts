import { generateId } from '@/ui/utils/generateId';
import type { DecisionActionId } from '@/ui/utils/decisionSpec';
import type { CodeAnnotation } from '@/ui/types';

/**
 * Pure transport routing for the review (agent-mode) decision control.
 *
 * `buildDecisionSpec` decides WHAT the header offers; this module decides
 * WHERE each choice goes. Review is single-transport: every
 * decision POSTs `/api/feedback`, with `approved` as the only fork —
 * approvals post `buildReviewApprovalBody` (bare, or with the live
 * annotations), and the post-confirm discard is the
 * same bare approve the Approve primary posts. Kept pure (no React, no
 * App import) so the handler-exhaustiveness test runs in the plain
 * `bun test` lane: every id the spec can emit must resolve here, and an id
 * added to `decisionSpec.ts` without a route fails the exhaustive switch.
 */
/**
 * Reads the `approvalNotesSupported` capability advert off a diff payload
 * (`/api/diff` and the switch family — the server echoes it on all).
 * Anything but a literal `true` reads as false: an OLD server that never
 * sends the field advertises "not capable" and the client renders no
 * approve-carrying items. A NEW server against an
 * old client changes nothing either (the field is simply ignored). Pinned by
 * `reviewDecision.test.ts`.
 */
export function readApprovalNotesAdvert(value: unknown): boolean {
  return value === true;
}

export type ReviewDecisionRoute =
  /** The adaptive primary: Approve at zero, Send Feedback otherwise. */
  | { kind: 'primary' }
  /** Leave without sending: POST /api/exit, the session is dismissed. */
  | { kind: 'close' }
  /** "Approve with notes": the live annotations + their export ride the
   *  approval. The spec emits it only when the server advertises
   *  `approvalNotesSupported` — i.e. when this session's decision consumer
   *  prints/sends approve-time feedback instead of discarding it. */
  | { kind: 'approve-with-notes' };

export function resolveReviewDecisionAction(id: DecisionActionId): ReviewDecisionRoute {
  switch (id) {
    case 'primary':
      return { kind: 'primary' };
    case 'approve-with-notes':
      return { kind: 'approve-with-notes' };
    case 'close-session':
      return { kind: 'close' };
  }
}

export interface ReviewApprovalBodyInput {
  draftGeneration: number;
  /** "Approve with notes": the live annotations ride the approval. */
  withAnnotations: boolean;
  /** The same export Send Feedback posts — what the agent reads as guidance. */
  feedbackMarkdown: string;
  annotations: CodeAnnotation[];
}

/**
 * The `/api/feedback` body for every approval.
 *
 * Older clients sent the placeholder `'LGTM - no changes requested.'` on
 * every approval; with consumers now printing approve-time feedback, that
 * placeholder would be appended to every bare approval, so it is gone:
 * a bare approval sends `feedback: ''`, which is also what finally makes the
 * archive's `lgtm` decision reachable and stops bare approvals writing a
 * sidecar. "Approve with notes" sends the live annotation export as the
 * feedback with the annotations riding for archive provenance.
 */
export function buildReviewApprovalBody(input: ReviewApprovalBodyInput): {
  draftGeneration: number;
  approved: true;
  feedback: string;
  annotations: unknown[];
} {
  if (input.withAnnotations) {
    return {
      draftGeneration: input.draftGeneration,
      approved: true,
      feedback: input.feedbackMarkdown,
      annotations: input.annotations,
    };
  }
  return {
    draftGeneration: input.draftGeneration,
    approved: true,
    feedback: '',
    annotations: [],
  };
}

/**
 * The one shape for a human review-level comment: `scope: 'general'` with the
 * ''/0/0 sentinels that keep it out of every file group. Produced by the
 * sidebar's "+ General comment".
 *
 * `generateId()` (crypto.randomUUID with an insecure-context fallback; remote-mode
 * http sessions have no crypto.randomUUID) rather than `Date.now()` because two commits in the
 * same millisecond would collide.
 *
 * Returns null for a whitespace-only note: the composer never commits an
 * empty comment.
 */
export function createGeneralReviewComment(text: string): CodeAnnotation | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return {
    id: generateId('review-note'),
    type: 'comment',
    scope: 'general',
    filePath: '',
    lineStart: 0,
    lineEnd: 0,
    side: 'new',
    text: trimmed,
    createdAt: Date.now(),
  };
}
