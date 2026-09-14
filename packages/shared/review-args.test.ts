import { describe, expect, test } from "bun:test";
import { parseReviewArgs } from "./review-args";

describe("parseReviewArgs", () => {
  test("defaults to undefined vcsType", () => {
    expect(parseReviewArgs("")).toEqual({
      vcsType: undefined,
    });
  });

  test("parses --git", () => {
    expect(parseReviewArgs("--git")).toEqual({
      vcsType: "git",
    });
  });


  test("accepts argv arrays from the compiled CLI", () => {
    expect(parseReviewArgs(["--git"])).toEqual({
      vcsType: "git",
    });
  });

  test("strips wrapping quotes from string and argv inputs", () => {
    expect(parseReviewArgs(`"--git"`)).toEqual({
      vcsType: "git",
    });
    expect(parseReviewArgs(["\"--git\""])).toEqual({
      vcsType: "git",
    });
  });

  test("ignores positional arguments", () => {
    expect(parseReviewArgs("--git extra-arg")).toEqual({
      vcsType: "git",
    });
  });
});
