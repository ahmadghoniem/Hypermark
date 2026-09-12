/**
 * Handler exhaustiveness for the annotate decision wiring (spec §8C, pure
 * lane — cannot silently skip).
 *
 * Neither app package is typechecked (spec §9), so the contract "every id the
 * spec can emit has a route" is enforced here at runtime: an id added to
 * `decisionSpec.ts` without a branch in `resolveAnnotateDecisionAction`
 * returns `undefined` and fails these sweeps.
 */
import { describe, expect, test } from "bun:test";
import {
  buildDecisionSpec,
  type DecisionSpecInput,
} from "@hypermark/ui/utils/decisionSpec";
import { resolveAnnotateDecisionAction } from "./annotateDecision";

/** Every input combination the annotate app can hand the spec builder. */
function annotateInputs(): DecisionSpecInput[] {
  const inputs: DecisionSpecInput[] = [];
  for (const gate of [false, true])
    for (const hasFeedback of [false, true])
      for (const approvalNotesSupported of [false, true])
        for (const count of [0, 1, 3])
          inputs.push({ app: "annotate", gate, count, hasFeedback, approvalNotesSupported });
  return inputs;
}

describe("annotate decision handler exhaustiveness", () => {
  // Guards a menu item with no handler — the failure mode the missing app
  // typecheck would otherwise catch.
  test("every id the spec can emit resolves to a route", () => {
    for (const input of annotateInputs()) {
      const spec = buildDecisionSpec(input);
      expect(resolveAnnotateDecisionAction("primary", { gate: input.gate })).toBeDefined();
      for (const item of spec.items) {
        const route = resolveAnnotateDecisionAction(item.id, { gate: input.gate });
        expect(route).toBeDefined();
        // A composer item routed anywhere but the note flow would drop the
        // typed note on the floor; a confirm item must be the close flow.
        if (item.composer) expect(route.kind).toBe("note");
        if (item.confirm) expect(route.kind).toBe("close");
      }
    }
  });

  // Guards the endpoint matrix (spec §3.1/§6.1): Done and every note stay on
  // /api/feedback so formatAnnotateOutcome shapes and strict-gate exit codes
  // are untouched; only gate-mode approvals reach /api/approve.
  test("note routes follow the gate's transport; no menu note ever carries approval framing", () => {
    const gated = { gate: true };
    const ungated = { gate: false };

    expect(resolveAnnotateDecisionAction("note-with-approval", gated))
      .toEqual({ kind: "note", route: "approve", approvalFraming: false });
    // The non-gate arm is dead code by construction since the empty-menu
    // collapse. Assert the unreachability itself (so this pin cannot pass
    // vacuously over a route the spec quietly resurrects)…
    for (const input of annotateInputs()) {
      if (input.gate) continue;
      expect(buildDecisionSpec(input).items.map((item) => item.id))
        .not.toContain("note-with-approval");
    }
    // …and pin that even a stray dispatch cannot fabricate approval framing.
    expect(resolveAnnotateDecisionAction("note-with-approval", ungated))
      .toEqual({ kind: "note", route: "feedback", approvalFraming: false });

    for (const ctx of [gated, ungated]) {
      // The two differ only by state, never by transport or framing.
      expect(resolveAnnotateDecisionAction("request-changes", ctx))
        .toEqual({ kind: "note", route: "feedback", approvalFraming: false });
      expect(resolveAnnotateDecisionAction("note-with-feedback", ctx))
        .toEqual(resolveAnnotateDecisionAction("request-changes", ctx));
    }

    // Close never varies by gate: it dismisses, it never approves.
    for (const ctx of [gated, ungated]) {
      expect(resolveAnnotateDecisionAction("close-session", ctx)).toEqual({ kind: "close" });
    }
  });
});
