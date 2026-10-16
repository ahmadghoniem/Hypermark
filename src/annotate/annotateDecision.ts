import type { DecisionActionId } from "@/ui/utils/decisionSpec";

/**
 * Pure transport routing for the annotate decision control.
 *
 * `buildDecisionSpec` decides WHAT the header offers; this module decides
 * WHERE each choice goes, on the two legacy transports and nothing else:
 * `Done` and feedback stay on `/api/feedback` so
 * `formatAnnotateOutcome` shapes and strict-gate exit codes are untouched,
 * and only gate-mode approvals reach `/api/approve`. Kept pure (no React,
 * no App import) so the handler-exhaustiveness test runs in the plain
 * `bun test` lane: every id the spec can emit must resolve here, and an id
 * added to `decisionSpec.ts` without a route fails the exhaustive switch.
 */
export type AnnotateDecisionRoute =
  | { kind: "primary" }
  /** Direct approve with the live feedback riding along (gate + capability). */
  | { kind: "approve-with-notes" }
  /** Leave without sending: POST /api/exit, the session is dismissed. */
  | { kind: "close" };

export function resolveAnnotateDecisionAction(id: DecisionActionId): AnnotateDecisionRoute {
  switch (id) {
    case "primary":
      return { kind: "primary" };
    case "approve-with-notes":
      return { kind: "approve-with-notes" };
    case "close-session":
      return { kind: "close" };
  }
}
