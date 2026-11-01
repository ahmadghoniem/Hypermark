/**
 * Pure state→spec mapping for the unified header decision control.
 *
 * No React, no DOM, no imports — this is what keeps the state matrix testable
 * in the plain `bun test` lane and keeps "both states are data, not forked
 * components" true. `DecisionControl.tsx` renders whatever this returns; the
 * app translates ids into handlers.
 *
 * Labels, subtitles and confirm strings are the approved prototype's
 * (DESIGN_final-proposal.html `spec()`), authoritative over any older branch
 * or mock copy — except where a later maintainer ruling supersedes it: the
 * menu has no note composers, since a global comment sent with the feedback
 * does the same, and no user-facing string uses an em dash.
 */

export type DecisionActionId =
  | 'primary'              // the left segment
  | 'close-session';       // "Close session" — dismisses, sends nothing

export type DecisionTone = 'primary' | 'neutral' | 'destructive';

export interface DecisionPrimary {
  id: 'primary';
  label: string;            // 'All good' | 'Send Feedback'
  shortLabel?: string;      // 'Send' — the lg-breakpoint label
  title: string;            // tooltip / aria description
  tone: Exclude<DecisionTone, 'destructive'>;
  icon?: 'send';
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
  confirm?: DecisionConfirm;     // present ⇒ the item raises one confirm
}

export interface DecisionSpec {
  primary: DecisionPrimary;
  items: DecisionMenuItem[];
}

export interface DecisionSpecInput {
  /** The count rendered in the pill and interpolated into labels. */
  count: number;
  /**
   * Whether there is anything to send. Deliberately separate from `count`:
   * annotate counts attachments as
   * feedback with count 0 .
   */
  hasFeedback: boolean;
}

function annotationNoun(count: number): string {
  return count === 1 ? 'annotation' : 'annotations';
}

/**
 * The empty state: no feedback to send, the primary is `All good`. The menu
 * holds only Close session: changes are requested by annotating (or adding a
 * global comment), which turns the primary into Send Feedback.
 */
function buildEmptySpec(input: DecisionSpecInput): DecisionSpec {
  return {
    primary: {
      id: 'primary',
      label: 'All good',
      title: 'Finish with no feedback',
      tone: 'neutral',
    },
    items: [buildCloseItem(input.count)],
  };
}

/** The feedback state: something to send, the primary is `Send Feedback`. */
function buildFeedbackSpec(input: DecisionSpecInput): DecisionSpec {
  const { count } = input;
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
    items: [buildCloseItem(count)],
  };
}

/**
 * The one way out that sends nothing. Present in every arm and at every
 * count: it replaces the header's standalone Close button, so it must be
 * reachable when there is nothing to lose as well as when there is.
 *
 * With annotations pending it keeps the confirm the old discard item carried,
 * because that is the only case where leaving costs the reviewer something.
 * The outcome is a dismissal either way: the agent is told the human left.
 */
function buildCloseItem(count: number): DecisionMenuItem {
  const noun = annotationNoun(count);
  return {
    id: 'close-session',
    label: count > 0 ? `Discard ${count} and close…` : 'Close session',
    subtitle: count > 0 ? 'Nothing is sent' : 'Sends nothing',
    tone: count > 0 ? 'destructive' : 'neutral',
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
  return input.hasFeedback ? buildFeedbackSpec(input) : buildEmptySpec(input);
}
