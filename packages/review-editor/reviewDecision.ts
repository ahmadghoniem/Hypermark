import { generateId } from '@hypermark/ui/utils/generateId';
import type { DecisionActionId } from '@hypermark/ui/utils/decisionSpec';
import type { CodeAnnotation } from '@hypermark/ui/types';

/**
 * Pure transport routing for the review (agent-mode) decision control.
 *
 * `buildDecisionSpec` decides WHAT the header offers; this module decides
 * WHERE each choice goes. Review is single-transport (spec §3.2/§6.1): every
 * decision POSTs `/api/feedback`, with `approved` as the only fork —
 * change-request notes commit a `scope:'general'` CodeAnnotation and ride the
 * send, approvals post `buildReviewApprovalBody` (bare, with a note, or with
 * the live annotations — PR5 delivery), and the post-confirm discard is the
 * same bare approve the Approve primary posts. Kept pure (no React, no
 * App import) so the §8C handler-exhaustiveness test runs in the plain
 * `bun test` lane: every id the spec can emit must resolve here, and an id
 * added to `decisionSpec.ts` without a route fails the exhaustive switch.
 */
/**
 * Reads the `approvalNotesSupported` capability advert off a diff payload
 * (`/api/diff` and the switch family — the server echoes it on all).
 * Anything but a literal `true` reads as false: an OLD server that never
 * sends the field advertises "not capable" and the client renders no
 * approve-carrying items — exactly the PR3 behavior. A NEW server against an
 * old client changes nothing either (the field is simply ignored). Pinned by
 * `reviewDecision.test.ts`.
 */
export function readApprovalNotesAdvert(value: unknown): boolean {
  return value === true;
}

export type ReviewDecisionRoute =
  /** The adaptive primary: Approve at zero, Send Feedback otherwise. */
  | { kind: 'primary' }
  /** Commit the note as a scope:'general' CodeAnnotation, then submit on the
   *  next render (the payload builders close over `allAnnotations`). */
  | { kind: 'note' }
  /** Leave without sending: POST /api/exit, the session is dismissed. */
  | { kind: 'close' }
  /** Approve with content riding along (PR5 delivery, spec §6.4). The spec
   *  emits these ids only when the server advertises `approvalNotesSupported`
   *  — i.e. when this session's decision consumer prints/sends approve-time
   *  feedback instead of discarding it. `withAnnotations` distinguishes
   *  "Approve with notes" (the live annotations + their export ride the
   *  approval) from "Approve with a note…" (the composer note alone). */
  | { kind: 'approve-with-notes'; withAnnotations: boolean };

export function resolveReviewDecisionAction(id: DecisionActionId): ReviewDecisionRoute {
  switch (id) {
    case 'primary':
      return { kind: 'primary' };
    case 'request-changes':
    case 'note-with-feedback':
      // The two differ only by state (empty vs feedback), never by transport.
      return { kind: 'note' };
    case 'note-with-approval':
      return { kind: 'approve-with-notes', withAnnotations: false };
    case 'approve-with-notes':
      return { kind: 'approve-with-notes', withAnnotations: true };
    case 'close-session':
      return { kind: 'close' };
  }
}

export interface ReviewApprovalBodyInput {
  draftGeneration: number;
  /** Composer note ("Approve with a note…"); whitespace-only means none. */
  note?: string;
  /** "Approve with notes": the live annotations ride the approval. */
  withAnnotations: boolean;
  /** The same export Send Feedback posts — what the agent reads as guidance. */
  feedbackMarkdown: string;
  annotations: CodeAnnotation[];
}

/**
 * The `/api/feedback` body for every approval (PR5 delivery, spec §6.4).
 *
 * The pre-PR5 client sent the placeholder `'LGTM - no changes requested.'` on
 * every approval; with consumers now printing approve-time feedback, that
 * placeholder would be appended to every bare approval, so it is gone:
 * a bare approval sends `feedback: ''`, which is also what finally makes the
 * archive's `lgtm` decision reachable and stops bare approvals writing a
 * sidecar (spec §6.2 fact 1). "Approve with a note…" sends the note as the
 * feedback; "Approve with notes" sends the live annotation export as the
 * feedback with the annotations riding for archive provenance.
 */
export function buildReviewApprovalBody(input: ReviewApprovalBodyInput): {
  draftGeneration: number;
  approved: true;
  feedback: string;
  annotations: unknown[];
} {
  const note = input.note?.trim() ?? '';
  if (input.withAnnotations) {
    return {
      draftGeneration: input.draftGeneration,
      approved: true,
      // A note must never be silently discarded because annotations also
      // ride: a future combined item (note + annotations) folds the note in
      // ahead of the export. Today's "Approve with notes" item has no
      // composer, so note is normally empty here.
      feedback: note ? `${note}\n\n${input.feedbackMarkdown}` : input.feedbackMarkdown,
      annotations: input.annotations,
    };
  }
  return {
    draftGeneration: input.draftGeneration,
    approved: true,
    feedback: note,
    annotations: [],
  };
}

/**
 * The one shape for a human review-level comment: `scope: 'general'` with the
 * ''/0/0 sentinels that keep it out of every file group. Shared by BOTH human
 * producers — the header composer's submit note (`commitReviewNote`) and the
 * sidebar's durable "+ General comment" — so the transport shape the
 * review-note payload tests pin cannot fork between them.
 *
 * `generateId()` (crypto.randomUUID with an insecure-context fallback; remote-mode
 * http sessions have no crypto.randomUUID) rather than `Date.now()` because two commits in the
 * same millisecond would collide and the deferred-submit effect keys on the
 * id (spec §9).
 *
 * Returns null for a whitespace-only note: the composers never commit an
 * empty comment.
 */
export function createGeneralReviewComment(text: string, author?: string): CodeAnnotation | null {
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
    ...(author ? { author } : {}),
  };
}
