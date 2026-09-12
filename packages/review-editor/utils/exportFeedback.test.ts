import { describe, it, expect } from "bun:test";
import { buildProseFeedback, exportReviewFeedback } from "./exportFeedback";
import { AnnotationType, type Annotation, type CodeAnnotation, type CommentAnnotation } from "@hypermark/ui/types";
import type { PRMetadata } from "@hypermark/shared/pr-types";

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

const prMeta: PRMetadata = {
  platform: "github",
  host: "github.com",
  owner: "acme",
  repo: "widgets",
  number: 42,
  title: "fix: broken widget",
  author: "alice",
  baseBranch: "main",
  headBranch: "fix/widget",
  baseSha: "abc123",
  headSha: "def456",
  url: "https://github.com/acme/widgets/pull/42",
};

describe("exportReviewFeedback", () => {
  it("includes a line comment's attached images (spec 05 §4.1.4)", () => {
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
    // Must not leak any PR-specific content
    expect(result).not.toContain("PR Review");
    expect(result).not.toContain("github.com");
    expect(result).not.toContain("Branch:");
    expect(result).not.toContain("acme");
  });

  it("local mode with null prMetadata: same as no prMetadata", () => {
    const result = exportReviewFeedback([ann()], null);
    expect(result).toStartWith("# Code Review Feedback\n\n");
    expect(result).not.toContain("PR Review");
  });

  it("local mode with undefined prMetadata: same as no prMetadata", () => {
    const result = exportReviewFeedback([ann()], undefined);
    expect(result).toStartWith("# Code Review Feedback\n\n");
    expect(result).not.toContain("PR Review");
  });

  it("local mode with diff context: describes mode + base in the header", () => {
    const result = exportReviewFeedback([ann()], undefined, {
      mode: "branch",
      base: "develop",
    });
    expect(result).toContain("**Diff:** Branch diff vs `develop`");
  });

  it("local mode with merge-base: labels committed changes with the base", () => {
    const result = exportReviewFeedback([ann()], undefined, {
      mode: "merge-base",
      base: "release/v2",
    });
    expect(result).toContain("**Diff:** Committed changes vs `release/v2`");
  });

  it("local mode with jj line of work: labels compare target in the header", () => {
    const result = exportReviewFeedback([ann()], undefined, {
      mode: "jj-line",
      base: "main",
    });
    expect(result).toContain("**Diff:** Line of work vs `main`");
  });

  it("local mode with worktree path: appends worktree info", () => {
    const result = exportReviewFeedback([ann()], undefined, {
      mode: "uncommitted",
      worktreePath: "/tmp/feature-wt",
    });
    expect(result).toContain("**Diff:** Uncommitted changes _(worktree: /tmp/feature-wt)_");
  });

  it("PR mode ignores diff context (PR header already carries branches)", () => {
    const result = exportReviewFeedback([ann()], prMeta, {
      mode: "branch",
      base: "develop",
    });
    // The PR-style branches line must appear.
    expect(result).toContain("Branch: `fix/widget` → `main`");
    // The local-mode Diff line must not.
    expect(result).not.toContain("**Diff:**");
  });

  it("PR mode: includes all PR context fields", () => {
    const result = exportReviewFeedback([ann()], prMeta);
    expect(result).toStartWith("# PR Review: acme/widgets#42\n\n");
    expect(result).toContain("**fix: broken widget**");
    expect(result).toContain("Branch: `fix/widget` → `main`");
    expect(result).toContain("https://github.com/acme/widgets/pull/42");
    // Must not contain the generic local header
    expect(result).not.toContain("# Code Review Feedback");
  });

  it("PR mode: includes stacked diff review scope when provided", () => {
    const result = exportReviewFeedback(
      [ann()],
      prMeta,
      undefined,
      "Full stack diff vs `main`",
    );

    expect(result).toContain("Review scope: Full stack diff vs `main`");
  });

  it("PR mode: annotations still render after PR header", () => {
    const result = exportReviewFeedback([ann({ text: "needs fix" })], prMeta);
    // PR header comes first, then file/line annotations
    const headerIdx = result.indexOf("PR Review:");
    const annotationIdx = result.indexOf("needs fix");
    expect(headerIdx).toBeLessThan(annotationIdx);
    expect(result).toContain("## src/index.ts");
    expect(result).toContain("### Line 10 (new)");
  });

  it("no annotations: returns generic empty regardless of prMetadata", () => {
    expect(exportReviewFeedback([], prMeta)).toBe("# Code Review\n\nNo feedback provided.");
    expect(exportReviewFeedback([], null)).toBe("# Code Review\n\nNo feedback provided.");
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






  it("emits a Highlighted text block for an edit-session selection comment", () => {
    const result = exportReviewFeedback([
      ann({ text: "Rename this", selectedText: "const widget = make();" }),
    ]);
    expect(result).toContain("Rename this\n");
    expect(result).toContain("**Highlighted text:**\n```\nconst widget = make();\n```");
    // A plain comment must never masquerade as a replacement.
    expect(result).not.toContain("approximate");
  });


  it("omits the Highlighted text block when there is no selectedText", () => {
    const result = exportReviewFeedback([ann()]);
    expect(result).not.toContain("**Highlighted text:**");
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

  it("contains exactly one top-level heading in PR mode", () => {
    const result = exportReviewFeedback([ann()], prMeta);
    const headingMatches = result.match(/^# /gm) || [];
    expect(headingMatches).toHaveLength(1);
  });

  it("multi-PR: annotation headings are one level deeper than file headings", () => {
    const result = exportReviewFeedback([
      ann({ prUrl: "https://github.com/acme/widgets/pull/1", prNumber: 1, prTitle: "PR 1", prRepo: "acme/widgets" }),
      ann({ prUrl: "https://github.com/acme/widgets/pull/2", prNumber: 2, prTitle: "PR 2", prRepo: "acme/widgets", filePath: "src/other.ts" }),
    ]);
    expect(result).toContain("### src/index.ts");
    expect(result).toContain("#### Line 10 (new)");
    expect(result).not.toMatch(/^### Line/m);
  });

  it("single-PR with mismatched prMeta uses annotation PR context", () => {
    const prMetaB: PRMetadata = { ...prMeta, number: 99, url: "https://github.com/acme/widgets/pull/99", title: "different PR" };
    const result = exportReviewFeedback([
      ann({ prUrl: "https://github.com/acme/widgets/pull/42", prNumber: 42, prTitle: "fix: broken widget", prRepo: "acme/widgets" }),
    ], prMetaB);
    expect(result).not.toContain("#99");
    expect(result).toContain("#42");
    expect(result).not.toContain("Multi-PR");
    expect(result).toContain("acme/widgets");
    expect(result).toContain("fix: broken widget");
  });

  it("multi-PR with diffScope: includes review scope line per PR group", () => {
    const result = exportReviewFeedback([
      ann({ prUrl: "https://github.com/acme/widgets/pull/1", prNumber: 1, prTitle: "PR 1", prRepo: "acme/widgets", diffScope: "layer" }),
      ann({ prUrl: "https://github.com/acme/widgets/pull/2", prNumber: 2, prTitle: "PR 2", prRepo: "acme/widgets", filePath: "src/other.ts", diffScope: "full-stack" }),
    ]);
    expect(result).toContain("Review scope: layer");
    expect(result).toContain("Review scope: full-stack");
  });

  it("multi-PR without diffScope: no review scope line", () => {
    const result = exportReviewFeedback([
      ann({ prUrl: "https://github.com/acme/widgets/pull/1", prNumber: 1, prTitle: "PR 1", prRepo: "acme/widgets" }),
      ann({ prUrl: "https://github.com/acme/widgets/pull/2", prNumber: 2, prTitle: "PR 2", prRepo: "acme/widgets", filePath: "src/other.ts" }),
    ]);
    expect(result).not.toContain("Review scope:");
  });

  it("non-stacked annotations have no diffScope in export", () => {
    const result = exportReviewFeedback([ann()], prMeta);
    expect(result).not.toContain("Review scope: layer");
    expect(result).not.toContain("Review scope: full-stack");
  });

  it("single-PR with uniform diffScope: derives scope from annotations, not prReviewScope param", () => {
    const result = exportReviewFeedback([
      ann({ diffScope: "layer" }),
      ann({ filePath: "src/other.ts", diffScope: "layer" }),
    ], prMeta);
    expect(result).toContain("Review scope: layer");
    expect(result).not.toContain("full-stack");
  });

  it("single-PR with mixed diffScope: groups annotations under scope headings", () => {
    const result = exportReviewFeedback([
      ann({ diffScope: "layer", text: "layer finding" }),
      ann({ filePath: "src/other.ts", diffScope: "full-stack", text: "full-stack finding" }),
    ], prMeta);
    // Should have separate scope sections, not comma-joined
    expect(result).not.toContain("layer, full-stack");
    // Each scope should be a heading
    expect(result).toContain("## Layer");
    expect(result).toContain("## Full-stack");
    // Annotations should be under their respective scopes
    const layerIdx = result.indexOf("## Layer");
    const fullStackIdx = result.indexOf("## Full-stack");
    const layerFindingIdx = result.indexOf("layer finding");
    const fullStackFindingIdx = result.indexOf("full-stack finding");
    expect(layerFindingIdx).toBeGreaterThan(layerIdx);
    expect(layerFindingIdx).toBeLessThan(fullStackIdx);
    expect(fullStackFindingIdx).toBeGreaterThan(fullStackIdx);
  });

  it("single-PR with one scope: no scope heading, just scope label in header", () => {
    const result = exportReviewFeedback([
      ann({ diffScope: "full-stack", text: "finding" }),
    ], prMeta);
    expect(result).toContain("Review scope: full-stack");
    // No scope sub-headings when all annotations share the same scope
    expect(result).not.toContain("## Full-stack");
    expect(result).not.toContain("## Layer");
  });

  it("prReviewScope param is ignored when annotations carry diffScope", () => {
    // Simulates Copy All bug: agent ran in layer, user switched to full-stack
    const result = exportReviewFeedback([
      ann({ diffScope: "layer", text: "agent finding" }),
    ], prMeta, undefined, "full-stack");
    // Should use annotation's diffScope, not the passed-in prReviewScope
    expect(result).toContain("Review scope: layer");
    expect(result).not.toContain("Review scope: full-stack");
  });

  it("general comments render under a General section, not a file/line group", () => {
    const result = exportReviewFeedback([
      ann({ id: "g", scope: "general", filePath: "", lineStart: 0, lineEnd: 0, text: "the overall approach is off" }),
    ]);
    expect(result).toContain("## General");
    expect(result).toContain("the overall approach is off");
    // No bogus line heading for a review-level comment.
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
    const result = exportReviewFeedback([ann({ commitSha: sha })], undefined, {
      mode: `commit:${sha}`,
      commitSubject: "fix: broken widget",
    });
    expect(result).toContain("**Diff:** Commit `0123456` — fix: broken widget (diff vs its parent)");
    // Anchor matches the header — no mismatch note.
    expect(result).not.toContain("anchored");
  });

  it("labels commit-anchored annotations exported under a different diff", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const result = exportReviewFeedback(
      [ann({ commitSha: sha, commitSubject: "feat: add widget" })],
      undefined,
      { mode: "since-base", base: "origin/main" },
    );
    expect(result).toContain('_Made on commit `0123456` ("feat: add widget") — anchored to that commit\'s diff, not the diff above._');
  });

  it("labels working-tree annotations exported under a commit diff", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const result = exportReviewFeedback([ann()], undefined, { mode: `commit:${sha}` });
    expect(result).toContain("_Made on a working-tree diff, not commit `0123456` — anchored there._");
  });

  it("does not label annotations sent from the commit they were made on", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const result = exportReviewFeedback(
      [ann({ commitSha: sha })],
      undefined,
      { mode: `commit:${sha}` },
    );
    expect(result).not.toContain("anchored");
  });

  it("renders readable GitButler targets and preserves annotation provenance", () => {
    const result = exportReviewFeedback(
      [ann({
        gitButlerDiffType: "gitbutler:branch:feature%2Fapi",
        gitButlerDiffLabel: "Branch: feature/api (committed changes)",
        gitButlerBase: "abc123",
        gitButlerSnapshotId: "snapshot-a",
      })],
      undefined,
      { mode: "gitbutler:branch:feature%2Fweb", base: "abc123", snapshotId: "snapshot-b" },
    );

    expect(result).toContain("**Diff:** GitButler branch `feature/web` (committed changes)");
    expect(result).toContain("_Made on Branch: feature/api (committed changes) — anchored to that GitButler diff, not the diff above._");
  });

  it("labels GitButler annotations after the same target refreshes to a new snapshot", () => {
    const result = exportReviewFeedback(
      [ann({
        gitButlerDiffType: "gitbutler:workspace",
        gitButlerDiffLabel: "GitButler workspace (all applied changes)",
        gitButlerBase: "abc123",
        gitButlerSnapshotId: "snapshot-a",
      })],
      undefined,
      { mode: "gitbutler:workspace", base: "abc123", snapshotId: "snapshot-b" },
    );
    expect(result).toContain("anchored to that GitButler diff");
  });
});

describe("buildProseFeedback — artifact annotations", () => {
  const artifact = {
    artifactId: "pr-artifact-video",
    artifactName: "Demo recording",
    artifactUrl: "https://example.com/demo.webm",
    artifactKind: "video" as const,
    sourceUrl: "https://github.com/acme/widgets/pull/42#issuecomment-9",
    anchor: { kind: "video" as const, timestamp: 83.4 },
  };

  it("exports a timestamped comment artifact as reply context for agent and GitHub delivery", () => {
    const annotation: CommentAnnotation = {
      id: "artifact-note",
      commentId: "issuecomment-9",
      commentAuthor: "alice",
      commentBody: "Here is the UI recording.",
      text: "The panel jumps at this moment.",
      createdAt: 1,
      artifact,
    };

    const output = buildProseFeedback([], [annotation], undefined);
    expect(output).toContain("# PR Artifact Feedback");
    expect(output).toContain("Demo recording — Video at 1:23");
    expect(output).toContain("In reply to the artifact source comment by @alice");
    expect(output).toContain("> Here is the UI recording.");
    expect(output).toContain("https://github.com/acme/widgets/pull/42#issuecomment-9");
  });

  it("keeps description artifact feedback separate from PR-description text anchors", () => {
    const annotation: Annotation = {
      id: "image-note",
      blockId: "",
      startOffset: 0,
      endOffset: 0,
      type: AnnotationType.GLOBAL_COMMENT,
      text: "Crop this more tightly.",
      originalText: "",
      createdA: 1,
      artifact: {
        ...artifact,
        artifactId: "pr-artifact-image",
        artifactName: "Hero image",
        artifactKind: "image",
        anchor: { kind: "image", x: 0.25, y: 0.4 },
      },
    };

    const output = buildProseFeedback([annotation], [], "![Hero image](https://example.com/hero.png)");
    expect(output).toContain("Hero image — Pin at 25%, 40%");
    expect(output).toContain("Regarding an artifact in the PR description.");
    expect(output).toContain("Crop this more tightly.");
  });
});

describe("exportReviewFeedback - workspace mode", () => {
  it("workspace mode: uses generic header, no PR content (same as local mode)", () => {
    // In workspace mode, prMetadata is explicitly undefined even if workspace exists
    const result = exportReviewFeedback([ann()], undefined);
    expect(result).toStartWith("# Code Review Feedback\n\n");
    expect(result).not.toContain("PR Review");
    expect(result).not.toContain("github.com");
    expect(result).not.toContain("Branch:");
  });

  it("groups annotations by repo-prefixed file paths", () => {
    const result = exportReviewFeedback([
      ann({ filePath: "repo-a/src/index.ts", lineStart: 5, text: "first" }),
      ann({ filePath: "repo-b/src/index.ts", lineStart: 1, text: "second" }),
    ]);
    // Different repos with same relative path should be separate groups
    expect(result).toContain("## repo-a/src/index.ts");
    expect(result).toContain("## repo-b/src/index.ts");
  });

  it("sorts annotations by line number within each repo-prefixed file", () => {
    const result = exportReviewFeedback([
      ann({ filePath: "repo-a/src/index.ts", lineStart: 20, text: "later" }),
      ann({ filePath: "repo-a/src/index.ts", lineStart: 5, text: "earlier" }),
      ann({ filePath: "repo-b/src/index.ts", lineStart: 15, text: "middle in repo-b" }),
    ]);
    const earlierIdx = result.indexOf("earlier");
    const laterIdx = result.indexOf("later");
    const middleInRepoB = result.indexOf("middle in repo-b");
    expect(earlierIdx).toBeLessThan(laterIdx);
    // Both repo-a annotations should come before repo-b (alphabetical by path)
    expect(laterIdx).toBeLessThan(middleInRepoB);
  });

  it("handles nested repo labels with overlapping paths", () => {
    // Tests the longest-prefix matching behavior from resolveWorkspaceFilePath
    const result = exportReviewFeedback([
      ann({ filePath: "apps/api/src/server.ts", text: "in nested repo" }),
      ann({ filePath: "apps/web/src/app.ts", text: "in sibling repo" }),
      ann({ filePath: "apps/src/main.ts", text: "in parent repo" }),
    ]);
    expect(result).toContain("## apps/api/src/server.ts");
    expect(result).toContain("## apps/web/src/app.ts");
    expect(result).toContain("## apps/src/main.ts");
  });

  it("handles deeply nested repo labels", () => {
    const result = exportReviewFeedback([
      ann({ filePath: "packages/shared/utils/helpers/string.ts", text: "deep path" }),
    ]);
    expect(result).toContain("## packages/shared/utils/helpers/string.ts");
    expect(result).toContain("### Line 10 (new)");
  });

  it("groups multiple annotations on same repo-prefixed file together", () => {
    const result = exportReviewFeedback([
      ann({ filePath: "repo-a/src/index.ts", lineStart: 5, text: "first comment" }),
      ann({ filePath: "repo-b/src/index.ts", lineStart: 10, text: "second comment" }),
      ann({ filePath: "repo-a/src/index.ts", lineStart: 15, text: "third comment" }),
    ]);
    // All repo-a comments should be grouped together
    const repoAHeaderIdx = result.indexOf("## repo-a/src/index.ts");
    const repoBHeaderIdx = result.indexOf("## repo-b/src/index.ts");
    const firstCommentIdx = result.indexOf("first comment");
    const thirdCommentIdx = result.indexOf("third comment");
    const secondCommentIdx = result.indexOf("second comment");

    expect(repoAHeaderIdx).toBeLessThan(repoBHeaderIdx);
    expect(firstCommentIdx).toBeLessThan(thirdCommentIdx);
    expect(thirdCommentIdx).toBeLessThan(repoBHeaderIdx);
    expect(repoBHeaderIdx).toBeLessThan(secondCommentIdx);
  });

  it("handles file-scoped annotations with repo-prefixed paths", () => {
    const result = exportReviewFeedback([
      ann({ filePath: "repo-a/src/index.ts", scope: "file", text: "file comment" }),
      ann({ filePath: "repo-a/src/index.ts", lineStart: 1, lineEnd: 1, text: "line comment" }),
    ]);
    expect(result).toContain("## repo-a/src/index.ts");
    expect(result).toContain("### File Comment");
    expect(result).toContain("### Line 1");
    const fileIdx = result.indexOf("File Comment");
    const lineIdx = result.indexOf("Line 1");
    expect(fileIdx).toBeLessThan(lineIdx);
  });

  it("handles repo labels with special characters in paths", () => {
    const result = exportReviewFeedback([
      ann({ filePath: "my-repo_2.0/src/index.ts", text: "special chars" }),
    ]);
    expect(result).toContain("## my-repo_2.0/src/index.ts");
  });

  it("empty annotations returns generic message regardless of workspace mode", () => {
    expect(exportReviewFeedback([], undefined)).toBe("# Code Review\n\nNo feedback provided.");
  });

  it("describes exact workspace diff mode in feedback context", () => {
    const staged = exportReviewFeedback([ann()], undefined, { mode: "workspace-staged" });
    const last = exportReviewFeedback([ann()], undefined, { mode: "workspace-last" });

    expect(staged).toContain("**Diff:** Workspace staged changes");
    expect(last).toContain("**Diff:** Workspace last change");
  });

  it("contains exactly one top-level heading in workspace mode", () => {
    const result = exportReviewFeedback([
      ann({ filePath: "repo-a/src/a.ts" }),
      ann({ filePath: "repo-b/src/b.ts" }),
    ]);
    const headingMatches = result.match(/^# /gm) || [];
    expect(headingMatches).toHaveLength(1);
  });
});

/**
 * The review-level note produced by the Send control's "Send with additional
 * feedback" action is a scope:'general' CodeAnnotation. These guard the export
 * shape it depends on — the whole feature rides the existing ## General
 * section, with no new export code.
 */

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
  // Guards giving the note a filePath or scope:'line', which would export it as
  // a comment on a file that is not in the diff (and create a group for "").
  it('renders under ## General and creates no file group', () => {
    const output = exportReviewFeedback([note('rebase before merging')]);
    const generalIndex = output.indexOf('## General');
    expect(generalIndex).toBeGreaterThan(-1);
    expect(output.indexOf('rebase before merging')).toBeGreaterThan(generalIndex);
    // No group header for the empty sentinel path.
    expect(output).not.toContain('## \n');
    expect(output).not.toMatch(/^## $/m);
  });

  // Guards the general/placed partition being bypassed, which would drop one
  // side or the other when a note is sent together with annotations.
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
