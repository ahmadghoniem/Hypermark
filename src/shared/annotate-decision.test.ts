import { describe, expect, test } from "bun:test";
import { createAnnotateDecisionSettler } from "./annotate-decision";

describe("annotate decision settler", () => {
  test("the first producer wins and resolves exactly once", () => {
    const resolved: string[] = [];
    const decision = createAnnotateDecisionSettler<string>((d) => resolved.push(d));

    expect(decision.settle("feedback")).toBe(true);
    expect(decision.isSettled()).toBe(true);
    expect(resolved).toEqual(["feedback"]);
  });

  test("a later producer loses and cannot resolve", () => {
    const resolved: string[] = [];
    const decision = createAnnotateDecisionSettler<string>((d) => resolved.push(d));

    decision.settle("dismissed");

    expect(decision.settle("feedback")).toBe(false);
    expect(decision.settle("annotated")).toBe(false);
    expect(resolved).toEqual(["dismissed"]);
  });

  test("nothing is settled before the first producer", () => {
    const decision = createAnnotateDecisionSettler<string>(() => {});
    expect(decision.isSettled()).toBe(false);
  });
});
