import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  annotateInputNamesExistingTarget,
  buildAmbiguousAnnotateArgsMessage,
  buildUnresolvedAnnotateArgsMessage,
  probeAnnotateToken,
  selectAnnotateTokenTarget,
} from "./annotate-target";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hypermark-annotate-target-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "notes/deep"), { recursive: true });
  writeFileSync(join(root, "plan.md"), "# Plan");
  writeFileSync(join(root, "docs/spec.md"), "# Spec");
  writeFileSync(join(root, "docs/page.html"), "<p>hi</p>");
  writeFileSync(join(root, "notes/deep/nested.md"), "# Nested");
  // Same basename twice for the ambiguous case.
  writeFileSync(join(root, "docs/dup.md"), "# A");
  writeFileSync(join(root, "notes/dup.md"), "# B");
  // Existing but not annotatable.
  writeFileSync(join(root, "script.py"), "print()");
  // Exists so that a wrongly split quoted token ("my notes.md" -> "notes.md")
  // would resolve if token boundaries were not preserved.
  writeFileSync(join(root, "notes.md"), "# Notes");
  // Wider plain-text set (guards ANNOTATABLE_DOC_REGEX breadth, which the
  // probe's no-walk cheapness for word tokens relies on).
  writeFileSync(join(root, "notes.txt"), "notes");
  writeFileSync(join(root, "config.yaml"), "a: 1");
  // Real scoped-package-style directory for the literal-@ fallback.
  mkdirSync(join(root, "@scope"), { recursive: true });
  writeFileSync(join(root, "@scope/README.md"), "# scoped");
  // Whole-string preference: the un-split input names this file even though
  // its second token also names an annotatable file on its own.
  writeFileSync(join(root, "Meeting Notes.md"), "# Meeting Notes");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const probe = (token: string) => probeAnnotateToken(token, root);

describe("probeAnnotateToken", () => {
  test("rejects URLs and folders (only local files are annotate targets)", () => {
    expect(probe("https://example.com/page")).toBeNull();
    expect(probe("docs")).toBeNull();
    expect(probe("docs/")).toBeNull();
  });

  test("resolves HTML files to absolute paths", () => {
    expect(probe("docs/page.html")).toBe(join(root, "docs/page.html"));
  });

  test("resolves documents, including fuzzy basename matches", () => {
    expect(probe("plan.md")).toBe(join(root, "plan.md"));
    expect(probe("nested.md")).toBe(join(root, "notes/deep/nested.md"));
    expect(probe("@plan.md")).toBe(join(root, "plan.md"));
  });

  test("resolves an absolute path", () => {
    expect(probe(join(root, "plan.md"))).toBe(join(root, "plan.md"));
  });

  test("resolves the wider plain-text set (.txt, .yaml)", () => {
    expect(probe("notes.txt")).toBe(join(root, "notes.txt"));
    expect(probe("config.yaml")).toBe(join(root, "config.yaml"));
  });

  test("resolves a scoped-package-style literal `@` path", () => {
    // The strip half of the `@` handling is covered above (@plan.md); this
    // covers the literal fallback: no `scope/README.md` exists, so only the
    // literal `@scope/README.md` path can match.
    expect(probe("@scope/README.md")).toBe(join(root, "@scope/README.md"));
  });

  test("returns the token itself for ambiguous document names", () => {
    expect(probe("dup.md")).toBe("dup.md");
  });

  test("accepts existing-but-unsupported files so the pipeline owns their errors", () => {
    expect(probe("script.py")).toBe(join(root, "script.py"));
  });

  test("rejects natural-language words and missing files", () => {
    expect(probe("the")).toBeNull();
    expect(probe("aim")).toBeNull();
    expect(probe("missing.md")).toBeNull();
    expect(probe("")).toBeNull();
  });

  test("bare directory names and trailing-slash paths never resolve", () => {
    expect(probeAnnotateToken("docs", root)).toBeNull();
    expect(probeAnnotateToken(".", root)).toBeNull();
    expect(probeAnnotateToken("docs/", root)).toBeNull();
  });
});

describe("annotateInputNamesExistingTarget", () => {
  test("true for anything the pipeline reaches a verdict on", () => {
    expect(annotateInputNamesExistingTarget("plan.md", root)).toBe(true);
    // Exists but unsupported: pipeline owns its specific error.
    expect(annotateInputNamesExistingTarget("script.py", root)).toBe(true);
  });

  test("false for URLs and folders", () => {
    expect(annotateInputNamesExistingTarget("docs", root)).toBe(false);
    expect(annotateInputNamesExistingTarget("https://example.com", root)).toBe(false);
  });

  test("false for natural language and empty input", () => {
    expect(annotateInputNamesExistingTarget("the aim doc", root)).toBe(false);
    expect(annotateInputNamesExistingTarget("", root)).toBe(false);
    expect(annotateInputNamesExistingTarget("   ", root)).toBe(false);
  });

  test("the whole un-split string wins over its own tokens", () => {
    // "Meeting Notes.md" names a real file whose second token ("Notes.md")
    // also resolves on its own; the pre-pass must prefer the whole string so
    // OpenCode/Pi keep supporting unquoted paths with spaces.
    expect(probeAnnotateToken("Notes.md", root)).not.toBeNull();
    expect(annotateInputNamesExistingTarget("Meeting Notes.md", root)).toBe(true);
    expect(probeAnnotateToken("Meeting Notes.md", root)).toBe(join(root, "Meeting Notes.md"));
  });
});

describe("selectAnnotateTokenTarget", () => {
  test("fast path: exactly one token resolves, trailing words ignored", () => {
    const selection = selectAnnotateTokenTarget("docs/spec.md please", probe);
    expect(selection.kind).toBe("single");
    if (selection.kind === "single") {
      expect(selection.candidate.token).toBe("docs/spec.md");
      expect(selection.candidate.value).toBe(join(root, "docs/spec.md"));
    }
  });

  test("fast path works with leading natural language", () => {
    const selection = selectAnnotateTokenTarget("annotate the plan.md for me", probe);
    expect(selection.kind).toBe("single");
    if (selection.kind === "single") {
      expect(selection.candidate.value).toBe(join(root, "plan.md"));
    }
  });

  test("two resolving tokens report ambiguity naming both candidates", () => {
    const selection = selectAnnotateTokenTarget("plan.md docs/spec.md", probe);
    expect(selection.kind).toBe("multiple");
    if (selection.kind === "multiple") {
      expect(selection.candidates.map((c) => c.token)).toEqual([
        "plan.md",
        "docs/spec.md",
      ]);
    }
  });

  test("duplicate tokens are probed once and stay a single candidate", () => {
    const selection = selectAnnotateTokenTarget("plan.md plan.md", probe);
    expect(selection.kind).toBe("single");
  });

  test("unrecognized dash tokens disable tolerance instead of being skipped", () => {
    // Known flags are stripped before selection, so any dash token here is a
    // typo'd flag; skipping it would change behavior.
    const typoFlag = selectAnnotateTokenTarget("the aim doc --markdwn", probe);
    expect(typoFlag.kind).toBe("flagged");
    if (typoFlag.kind === "flagged") {
      expect(typoFlag.flagTokens).toEqual(["--markdwn"]);
    }
  });

  test("pre-split argv tokens keep quoted arguments whole", () => {
    // "my notes.md" arrived as ONE argv token; it must be probed as one
    // token, never re-split so that "notes.md" silently resolves.
    const selection = selectAnnotateTokenTarget(["my notes.md", "runme"], probe);
    expect(selection.kind).toBe("none");
    if (selection.kind === "none") {
      expect(selection.words).toEqual(["my notes.md", "runme"]);
    }
  });

  test("nothing resolves reports the words tried", () => {
    const selection = selectAnnotateTokenTarget("and give me the URL for it", probe);
    expect(selection.kind).toBe("none");
    if (selection.kind === "none") {
      expect(selection.words).toContain("give");
      expect(selection.words).not.toContain("and give");
    }
  });
});

describe("message builders", () => {
  test("ambiguity message names every candidate and its resolution", () => {
    const message = buildAmbiguousAnnotateArgsMessage([
      { token: "a.md", value: "/repo/a.md" },
      { token: "b.md", value: "/repo/b.md" },
    ]);
    expect(message).toContain("a.md -> /repo/a.md");
    expect(message).toContain("b.md -> /repo/b.md");
    expect(message).toContain("exactly one target");
  });

  test("unresolved message echoes the words and usage", () => {
    const message = buildUnresolvedAnnotateArgsMessage({
      words: ["the", "aim", "doc"],
    });
    expect(message).toContain("the aim doc");
    expect(message).toContain("hypermark annotate <file.md | file.txt | file.html>");
    expect(message).not.toContain("If you are an agent");
  });

  test("agent handoff adds the re-run instruction and preserves flags", () => {
    const message = buildUnresolvedAnnotateArgsMessage({
      words: ["the", "aim", "doc"],
      flags: ["--markdown"],
      agentHandoff: true,
    });
    expect(message).toContain("If you are an agent reading this");
    expect(message).toContain("hypermark annotate <path> --markdown");
  });
});
