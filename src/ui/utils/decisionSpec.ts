/**
 * Pure state→spec mapping for the unified header decision control.
 *
 * No React, no DOM, no imports — this is what keeps the state matrix testable
 * in the plain `bun test` lane and keeps "both apps and both states are data,
 * not forked components" true. `DecisionControl.tsx` renders whatever this
 * returns; the apps translate ids into handlers.
 *
 * Labels, subtitles and confirm strings are the approved prototype's
 * (DESIGN_final-proposal.html `spec()`), authoritative over any older branch
 * or mock copy — except where a later maintainer ruling supersedes it: the
 * menu has no note composers, since a global comment (annotate) or a general
 * comment (review) sent with the feedback does the same, and no user-facing
 * string uses an em dash.
 */

export type DecisionActionId =
  | 'primary'              // the left segment
  | 'approve-with-notes'   // review + gate-annotate; capability-gated
  | 'close-session';       // "Close session" — dismisses, sends nothing

export type DecisionTone = 'success' | 'primary' | 'neutral' | 'destructive';

export interface DecisionPrimary {
  id: 'primary';
  label: string;            // 'All good' | 'Approve' | 'Send Feedback'
  shortLabel?: string;      // 'Send' — the lg-breakpoint label
  title: string;            // tooltip / aria description
  tone: Exclude<DecisionTone, 'destructive'>;
  icon?: 'check' | 'send';
  count?: number;           // rendered as the inline pill; omitted when 0
}

export interface DecisionConfirm {
  title: string;
  message: string;
  confirmText: string;
}

export interface DecisionMenuItem {
  id: Exclude<DecisionActionId, 'primary'>;
  label: string;
  subtitle: string;
  tone: DecisionTone;
  icon?: 'check' | 'send';
  dividerBefore?: boolean;
  confirm?: DecisionConfirm;     // present ⇒ the item raises one confirm
}

export interface DecisionSpec {
  primary: DecisionPrimary;
  items: DecisionMenuItem[];
}

export interface DecisionSpecInput {
  app: 'annotate' | 'review';
  /** Annotate: `gate`. Review: always true — review's primary decision IS approval. */
  gate: boolean;
  /** The count rendered in the pill and interpolated into labels. */
  count: number;
  /**
   * Whether there is anything to send. Deliberately separate from `count`:
   * annotate counts attachments as
   * feedback with count 0 (`hasFeedbackContent` in the annotate app).
   */
  hasFeedback: boolean;
  /** Does the runtime deliver feedback on approve? Gates every approve-carrying item. */
  approvalNotesSupported: boolean;
}

function annotationNoun(count: number): string {
  return count === 1 ? 'annotation' : 'annotations';
}

/**
 * The empty state: no feedback to send, the primary is the positive finish.
 * `approvalFlow` (gate annotate, or review) makes it `Approve`; plain annotate
 * gets `All good`. Either way the menu holds only Close session: changes are
 * requested by annotating (or adding a global or general comment) and
 * sending, which turns the primary into Send Feedback.
 */
function buildEmptySpec(input: DecisionSpecInput, approvalFlow: boolean): DecisionSpec {
  if (!approvalFlow) {
    return {
      primary: {
        id: 'primary',
        // Frozen copy (maintainer-approved): 'All good'.
        label: 'All good',
        title: 'Finish with no feedback',
        // Maintainer ruling (post-demo): All good without a gate is a positive
        // finish, NOT an approval — no success tone, no check icon, so it
        // can never be mistaken for the gate/review Approve.
        tone: 'neutral',
      },
      items: [buildCloseItem(input.count, false)],
    };
  }

  return {
    primary: {
      id: 'primary',
      // Frozen copy (maintainer-approved): 'Approve'.
      label: 'Approve',
      title: 'Approve, no changes',
      tone: 'success',
      icon: 'check',
    },
    items: [buildCloseItem(input.count, false)],
  };
}

/**
 * The feedback state: something to send, the primary is `Send Feedback`.
 * Identical across apps.
 */
function buildFeedbackSpec(input: DecisionSpecInput, approvalFlow: boolean): DecisionSpec {
  const { count } = input;
  const noun = annotationNoun(count);
  const items: DecisionMenuItem[] = [];

  // Capability-gated only (F2 ruling, maintainer-confirmed): at count 0 the feedback is attachments, and a capable approve transport delivers those too,
  // so the item stays offered with zero-form copy — no "0 annotations"
  // language. Subtitles are free prose, NOT frozen.
  if (approvalFlow && input.approvalNotesSupported) {
    items.push({
      id: 'approve-with-notes',
      // Frozen copy (maintainer-approved): 'Approve with notes'.
      label: 'Approve with notes',
      subtitle:
        count > 0
          ? `${count} ${noun} as guidance`
          : 'Edits as guidance',
      tone: 'success',
      icon: 'check',
    });
  }

  items.push(buildCloseItem(count, items.length > 0));

  return {
    primary: {
      id: 'primary',
      // Frozen copy (maintainer-approved): 'Send Feedback'.
      label: 'Send Feedback',
      shortLabel: 'Send',
      title: 'Send feedback to the agent',
      tone: 'primary',
      icon: 'send',
      count: count > 0 ? count : undefined,
    },
    items,
  };
}

/**
 * The one way out that sends nothing. Present in every arm and at every
 * count: it replaces the header's standalone Close button, so it must be
 * reachable when there is nothing to lose as well as when there is.
 *
 * With annotations pending it keeps the confirm the old discard item carried,
 * because that is the only case where leaving costs the reviewer something.
 * The outcome is a dismissal either way — the agent is told the human left,
 * never that the work was approved.
 */
function buildCloseItem(count: number, dividerBefore: boolean): DecisionMenuItem {
  const noun = annotationNoun(count);
  return {
    id: 'close-session',
    label: count > 0 ? `Discard ${count} and close…` : 'Close session',
    subtitle: count > 0 ? 'Nothing is sent' : 'Sends nothing',
    tone: count > 0 ? 'destructive' : 'neutral',
    dividerBefore,
    ...(count > 0
      ? {
          confirm: {
            title: `Discard ${count} ${noun} and close?`,
            message:
              'They are not sent. The agent is told you dismissed the session.',
            confirmText: 'Close anyway',
          },
        }
      : {}),
  };
}

export function buildDecisionSpec(input: DecisionSpecInput): DecisionSpec {
  // Review's primary positive decision IS approval, gate flag or not.
  const approvalFlow = input.app === 'review' || input.gate;
  return input.hasFeedback
    ? buildFeedbackSpec(input, approvalFlow)
    : buildEmptySpec(input, approvalFlow);
}
