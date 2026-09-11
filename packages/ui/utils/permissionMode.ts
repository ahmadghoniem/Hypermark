/**
 * The permission mode Claude Code resumes in after a plan is approved.
 *
 * Sent on `POST /api/approve` and handed back to Claude Code as
 * `updatedPermissions` (Claude Code 2.1.7+). It is a constant rather than a
 * setting on purpose: the question it asked — "how much should the agent ask
 * you once you have already said go" — got the same answer every time, and a
 * four-way select plus a first-run dialog is a lot of surface for an answer
 * nobody changes. Approving a plan is itself the moment of consent; making the
 * reviewer re-authorize the agent immediately afterwards is the same consent
 * collected twice.
 *
 * `bypassPermissions` is the Claude Code `--dangerously-skip-permissions`
 * equivalent. If a future session wants the agent to stop at shell and network
 * calls while still auto-applying edits, `acceptEdits` is the one-word change,
 * and the wire format never moves.
 */
export const PLAN_APPROVAL_PERMISSION_MODE = 'bypassPermissions';
