/**
 * Handler exhaustiveness for the annotate decision wiring (pure lane —
 * cannot silently skip).
 *
 * Neither app package is typechecked, so the contract "every id the
 * spec can emit has a route" is enforced here at runtime: an id added to
 * `decisionSpec.ts` without a branch in `resolveAnnotateDecisionAction`
 * returns `undefined` and fails these sweeps.
 */
import { describe, expect, test } from "bun:test";
import {
  buildDecisionSpec,
  type DecisionSpecInput,
} from "@/ui/utils/decisionSpec";
import { resolveAnnotateDecisionAction } from "./annotateDecision";

/** Every input combination the annotate app can hand the spec builder. */
function annotateInputs(): DecisionSpecInput[] {
  const inputs: DecisionSpecInput[] = [];
  for (const gate of [false, true])
    for (const hasFeedback of [false, true])
      for (const approvalNotesSupported of [false, true])
        for (const count of [0, 1, 3])
          inputs.push({ gate, count, hasFeedback, approvalNotesSupported });
  return inputs;
}

describe("annotate decision handler exhaustiveness", () => {
  // Guards a menu item with no handler — the failure mode the missing app
  // typecheck would otherwise catch.
  test("every id the spec can emit resolves to a route", () => {
    for (const input of annotateInputs()) {
      const spec = buildDecisionSpec(input);
      expect(resolveAnnotateDecisionAction("primary")).toBeDefined();
      for (const item of spec.items) {
        const route = resolveAnnotateDecisionAction(item.id);
        expect(route).toBeDefined();
        // A confirm item must be the close flow.
        if (item.confirm) expect(route.kind).toBe("close");
      }
    }
  });

  // Close dismisses, it never approves.
  test("close routes to the close flow", () => {
    expect(resolveAnnotateDecisionAction("close-session")).toEqual({ kind: "close" });
  });
});
