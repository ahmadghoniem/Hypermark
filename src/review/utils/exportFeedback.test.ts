import { describe, it, expect } from "bun:test";
import { exportReviewFeedback } from "./exportFeedback";
import type { CodeAnnotation } from "@/ui/types";

const ann = (overrides: Partial<CodeAnnotation> = {}): CodeAnnotation => ({
  id: "1",
  type: "comment",
  filePath: "src/index.ts",
  lineStart: 10,
  lineEnd: 10,
  side: "new",
  text: "This looks wrong",
  createdAt: Date.now(),
  ...overrides,
});


describe("exportReviewFeedback", () => {
  it("includes a line comment's attached images", () => {
    const result = exportReviewFeedback([ann({
      images: [
        { path: '/uploads/a.png', name: 'a.png' },
        { path: '/uploads/b.png', name: 'b.png' },
      ],
    })]);

    expect(result).toContain('**Attached images:**');
    expect(result).toContain('- [a.png] `/uploads/a.png`');
    expect(result).toContain('- [b.png] `/uploads/b.png`');
  });

  it("includes a file comment's attached images", () => {
    const result = exportReviewFeedback([ann({
      scope: 'file',
      lineStart: 1,
      lineEnd: 1,
      images: [{ path: '/uploads/c.png', name: 'c.png' }],
    })]);

    expect(result).toContain('### File Comment');
    expect(result).toContain('- [c.png] `/uploads/c.png`');
  });

  it("local mode: uses generic header, no PR content", () => {
    const result = exportReviewFeedback([ann()]);
    expect(result).toStartWith("# Code Review Feedback\n\n");
    expect(result).not.toContain("PR Review");
    expect(result).not.toContain("github.com");
    expect(result).not.toContain("Branch:");
    expect(result).not.toContain("acme");
  });

  it("local mode with diff context: describes mode + base in the header", () => {
    const result = exportReviewFeedback([ann()], {
      mode: "branch",
      base: "develop",
    });
    expect(result).toContain("**Diff:** Branch diff vs `develop`");
  });

  it("local mode with merge-base: labels committed changes with the base", () => {
    const result = exportReviewFeedback([ann()], {
      mode: "merge-base",
      base: "release/v2",
    });
    expect(result).toContain("**Diff:** Committed changes vs `release/v2`");
  });

  it("local mode with worktree path: appends worktree info", () => {
    const result = exportReviewFeedback([ann()], {
      mode: "uncommitted",
      worktreePath: "/tmp/feature-wt",
    });
    expect(result).toContain("**Diff:** Uncommitted changes _(worktree: /tmp/feature-wt)_");
  });

  it("no annotations: returns generic empty", () => {
    expect(exportReviewFeedback([])).toBe("# Code Review\n\nNo feedback provided.");
  });

  it("groups annotations by file", () => {
    const result = exportReviewFeedback([
      ann({ filePath: "a.ts", lineStart: 5, lineEnd: 5, text: "first" }),
      ann({ filePath: "b.ts", lineStart: 1, lineEnd: 1, text: "second" }),
    ]);
    expect(result).toContain("## a.ts");
    expect(result).toContain("## b.ts");
  });

  it("sorts annotations by line number within a file", () => {
    const result = exportReviewFeedback([
      ann({ lineStart: 20, lineEnd: 20, text: "later" }),
      ann({ lineStart: 5, lineEnd: 5, text: "earlier" }),
    ]);
    const earlierIdx = result.indexOf("earlier");
    const laterIdx = result.indexOf("later");
    expect(earlierIdx).toBeLessThan(laterIdx);
  });

  it("puts file-scoped annotations before line annotations", () => {
    const result = exportReviewFeedback([
      ann({ lineStart: 1, lineEnd: 1, text: "line comment" }),
      ann({ scope: "file", text: "file comment" }),
    ]);
    const fileIdx = result.indexOf("File Comment");
    const lineIdx = result.indexOf("Line 1");
    expect(fileIdx).toBeLessThan(lineIdx);
  });

  it("renders line ranges", () => {
    const result = exportReviewFeedback([
      ann({ lineStart: 10, lineEnd: 15 }),
    ]);
    expect(result).toContain("### Lines 10-15 (new)");
  });

  it("renders single lines", () => {
    const result = exportReviewFeedback([
      ann({ lineStart: 7, lineEnd: 7 }),
    ]);
    expect(result).toContain("### Line 7 (new)");
  });

  it("includes side indicator", () => {
    const result = exportReviewFeedback([
      ann({ side: "old", lineStart: 3, lineEnd: 3 }),
    ]);
    expect(result).toContain("### Line 3 (old)");
  });

  it("contains exactly one top-level heading so integrations can use the output directly", () => {
    const result = exportReviewFeedback([ann()]);
    const headingMatches = result.match(/^# /gm) || [];
    expect(headingMatches).toHaveLength(1);
  });

  it("general comments render under a General section, not a file/line group", () => {
    const result = exportReviewFeedback([
      ann({ id: "g", scope: "general", filePath: "", lineStart: 0, lineEnd: 0, text: "the overall approach is off" }),
    ]);
    expect(result).toContain("## General");
    expect(result).toContain("the overall approach is off");
    expect(result).not.toContain("Line 0");
  });

  it("mixes line and general: both appear, general in its own section", () => {
    const result = exportReviewFeedback([
      ann({ id: "l", text: "line issue" }),
      ann({ id: "g", scope: "general", filePath: "", lineStart: 0, lineEnd: 0, text: "review-wide note" }),
    ]);
    expect(result).toContain("line issue");
    expect(result).toContain("## General");
    expect(result).toContain("review-wide note");
  });

  it("labels the header with short sha + subject for a commit diff", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const result = exportReviewFeedback([ann({ commitSha: sha })], {
      mode: `commit:${sha}`,
      commitSubject: "fix: broken widget",
    });
    expect(result).toContain("**Diff:** Commit `0123456` — fix: broken widget (diff vs its parent)");
    expect(result).not.toContain("anchored");
  });

  it("labels commit-anchored annotations exported under a different diff", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const result = exportReviewFeedback(
      [ann({ commitSha: sha, commitSubject: "feat: add widget" })],
      { mode: "since-base", base: "origin/main" },
    );
    expect(result).toContain('_Made on commit `0123456` ("feat: add widget") — anchored to that commit\'s diff, not the diff above._');
  });

  it("labels working-tree annotations exported under a commit diff", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const result = exportReviewFeedback([ann()], { mode: `commit:${sha}` });
    expect(result).toContain("_Made on a working-tree diff, not commit `0123456` — anchored there._");
  });

  it("does not label annotations sent from the commit they were made on", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const result = exportReviewFeedback(
      [ann({ commitSha: sha })],
      { mode: `commit:${sha}` },
    );
    expect(result).not.toContain("anchored");
  });
});

const note = (text: string): CodeAnnotation => ({
  id: 'review-note-1',
  type: 'comment',
  scope: 'general',
  filePath: '',
  lineStart: 0,
  lineEnd: 0,
  side: 'new',
  text,
  createdAt: 1,
});

const lineComment = (): CodeAnnotation => ({
  id: 'c1',
  type: 'comment',
  filePath: 'src/index.ts',
  lineStart: 10,
  lineEnd: 10,
  side: 'new',
  text: 'this branch is unreachable',
  createdAt: 2,
});

describe('exportReviewFeedback - review-level note', () => {
  it('renders under ## General and creates no file group', () => {
    const output = exportReviewFeedback([note('rebase before merging')]);
    const generalIndex = output.indexOf('## General');
    expect(generalIndex).toBeGreaterThan(-1);
    expect(output.indexOf('rebase before merging')).toBeGreaterThan(generalIndex);
    expect(output).not.toContain('## \n');
    expect(output).not.toMatch(/^## $/m);
  });

  it('co-exists with placed annotations: both the file group and General survive', () => {
    const output = exportReviewFeedback([lineComment(), note('and split the migration')]);
    expect(output).toContain('## src/index.ts');
    expect(output).toContain('this branch is unreachable');
    expect(output).toContain('## General');
    expect(output).toContain('and split the migration');
  });

  it('a note alone is real feedback, not the empty-review message', () => {
    const output = exportReviewFeedback([note('ship it after the docs land')]);
    expect(output).not.toContain('No feedback provided.');
  });
});
