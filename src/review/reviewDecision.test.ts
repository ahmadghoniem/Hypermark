/**
 * Handler exhaustiveness for the review (agent-mode) decision wiring
 * (pure lane — cannot silently skip).
 *
 * Neither app package is typechecked, so the contract "every id the
 * spec can emit has a route" is enforced here at runtime: an id added to
 * `decisionSpec.ts` without a branch in `resolveReviewDecisionAction` (or the
 * compact row mapper) returns `undefined` and fails these sweeps.
 */
import { describe, expect, test } from "bun:test";
import {
  buildDecisionSpec,
  type DecisionSpecInput,
} from "@/ui/utils/decisionSpec";
import {
  buildReviewApprovalBody,
  createGeneralReviewComment,
  readApprovalNotesAdvert,
  resolveReviewDecisionAction,
} from "./reviewDecision";

/** Every input combination the review app can hand the spec builder — the
 *  advert swept both ways, so neither advert state can surface an unrouted
 *  id. */
function reviewInputs(): DecisionSpecInput[] {
  const inputs: DecisionSpecInput[] = [];
  for (const approvalNotesSupported of [false, true])
    for (const count of [0, 1, 3])
      inputs.push({
        app: "review",
        gate: true,
        count,
        hasFeedback: count > 0,
        approvalNotesSupported,
      });
  return inputs;
}

describe("review decision handler exhaustiveness", () => {
  // Guards a menu item with no handler — the failure mode the missing app
  // typecheck would otherwise catch.
  test("every id the spec can emit resolves to a route", () => {
    for (const input of reviewInputs()) {
      const spec = buildDecisionSpec(input);
      expect(resolveReviewDecisionAction("primary")).toBeDefined();
      for (const item of spec.items) {
        const route = resolveReviewDecisionAction(item.id);
        expect(route).toBeDefined();
        // A confirm item must be the close flow (the one remaining guard
        // dialog).
        if (item.confirm) expect(route.kind).toBe("close");
      }
    }
  });

  test("close and approve-with-notes route to their flows", () => {
    expect(resolveReviewDecisionAction("close-session").kind).toBe("close");
    expect(resolveReviewDecisionAction("approve-with-notes"))
      .toEqual({ kind: "approve-with-notes" });
  });

  // The advert may only emit approve-carrying ids whose route DELIVERS the
  // content: under a true advert, "Approve with notes" posts the live
  // annotations + their export, never an empty body and never the removed
  // LGTM placeholder.
  test("under a true advert, Approve with notes delivers the annotations", () => {
    const EXPORT = "# Code Review Feedback\n\n## General\n\n- overall note\n";
    const NOTE_ANNOTATION = createGeneralReviewComment("overall note")!;
    const spec = buildDecisionSpec({
      app: "review",
      gate: true,
      count: 2,
      hasFeedback: true,
      approvalNotesSupported: true,
    });
    expect(spec.items.map((item) => item.id)).toContain("approve-with-notes");
    const body = buildReviewApprovalBody({
      draftGeneration: 1,
      withAnnotations: true,
      feedbackMarkdown: EXPORT,
      annotations: [NOTE_ANNOTATION],
    });
    expect(body.approved).toBe(true);
    // The annotations ride for archive provenance, and their export is the
    // feedback the consumer prints after the approved prompt.
    expect(body.feedback).toBe(EXPORT);
    expect(body.annotations).toEqual([NOTE_ANNOTATION]);
  });

  // Compatibility matrix: old server / new client — a payload
  // without the field reads false, so no approve-carrying item renders; and
  // the new bare approval sends `feedback: ''` instead of
  // the removed LGTM placeholder, which is what makes the archive's `lgtm`
  // decision reachable and stops bare approvals writing sidecars.
  test("absent advert reads false, and a bare approval carries no placeholder", () => {
    expect(readApprovalNotesAdvert(undefined)).toBe(false);
    // Only a literal true is capable — a truthy string or number is not.
    expect(readApprovalNotesAdvert("true")).toBe(false);
    expect(readApprovalNotesAdvert(1)).toBe(false);
    expect(readApprovalNotesAdvert(true)).toBe(true);

    const spec = buildDecisionSpec({
      app: "review",
      gate: true,
      count: 2,
      hasFeedback: true,
      approvalNotesSupported: readApprovalNotesAdvert(undefined),
    });
    for (const item of spec.items) {
      expect(resolveReviewDecisionAction(item.id).kind).not.toBe("approve-with-notes");
    }

    const bare = buildReviewApprovalBody({
      draftGeneration: 3,
      withAnnotations: false,
      feedbackMarkdown: "# Code Review Feedback\n",
      annotations: [createGeneralReviewComment("x")!],
    });
    expect(bare).toEqual({ draftGeneration: 3, approved: true, feedback: "", annotations: [] });
  });
});

describe("createGeneralReviewComment — the one review-level comment shape", () => {
  // Guards the transport shape the sidebar's "+ General comment" depends on:
  // the ''/0/0 sentinels keep it out of every file group and the payload
  // tests pin the same shape on the wire.
  test("commits a trimmed scope:'general' comment with the sentinel anchor", () => {
    const note = createGeneralReviewComment("  Split this into two PRs.  ");
    expect(note).toMatchObject({
      type: "comment",
      scope: "general",
      filePath: "",
      lineStart: 0,
      lineEnd: 0,
      side: "new",
      text: "Split this into two PRs.",
    });
    // Two commits in one millisecond must not collide (why randomUUID, not
    // Date.now()).
    expect(createGeneralReviewComment("a")!.id).not.toBe(createGeneralReviewComment("a")!.id);
  });

  test("a whitespace-only note never commits", () => {
    expect(createGeneralReviewComment("   \n  ")).toBeNull();
    expect(createGeneralReviewComment("")).toBeNull();
  });
});
