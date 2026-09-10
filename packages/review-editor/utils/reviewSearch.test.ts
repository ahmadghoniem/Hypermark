import { describe, expect, it } from 'bun:test';

import {
  buildSearchIndex,
  findMatchesInIndex,
  findReviewSearchMatches,
  getReviewSearchSideLabel,
  groupReviewSearchMatches,
  type ReviewSearchableDiffFile,
} from './reviewSearch';

const diffFiles: ReviewSearchableDiffFile[] = [
  {
    path: 'src/alpha.ts',
    patch: [
      'diff --git a/src/alpha.ts b/src/alpha.ts',
      'index 1111111..2222222 100644',
      '--- a/src/alpha.ts',
      '+++ b/src/alpha.ts',
      '@@ -10,3 +10,4 @@ export function alpha() {',
      '-  const searchTerm = oldValue;',
      '+  const searchTerm = newValue;',
      '   return searchTerm;',
      '+  console.log(searchTerm);',
      ' }',
    ].join('\n'),
    additions: 2,
    deletions: 1,
  },
  {
    path: 'src/beta.ts',
    patch: [
      'diff --git a/src/beta.ts b/src/beta.ts',
      'index 3333333..4444444 100644',
      '--- a/src/beta.ts',
      '+++ b/src/beta.ts',
      '@@ -1,2 +1,2 @@',
      '-export const beta = () => "before";',
      '+export const beta = () => "searchTerm";',
    ].join('\n'),
    additions: 1,
    deletions: 1,
  },
];

describe('reviewSearch', () => {
  it('returns no matches for empty queries', () => {
    expect(findReviewSearchMatches(diffFiles, '')).toEqual([]);
    expect(findReviewSearchMatches(diffFiles, '   ')).toEqual([]);
  });

  it('finds matches across multiple files and diff sides', () => {
    const matches = findReviewSearchMatches(diffFiles, 'searchterm');

    expect(matches).toHaveLength(5);
    expect(matches.map(match => [match.filePath, match.side, match.lineNumber])).toEqual([
      ['src/alpha.ts', 'deletion', 10],
      ['src/alpha.ts', 'addition', 10],
      ['src/alpha.ts', 'context', 11],
      ['src/alpha.ts', 'addition', 12],
      ['src/beta.ts', 'addition', 1],
    ]);
  });

  it('matches case-insensitively and keeps snippet context', () => {
    const [match] = findReviewSearchMatches(diffFiles, 'SEARCHTERM');

    expect(match).toBeDefined();
    expect(match.text).toContain('searchTerm');
    expect(match.snippet).toContain('searchTerm');
  });

  it('preserves both new and old line numbers for context matches', () => {
    const contextMatch = findReviewSearchMatches(diffFiles, 'return').find(match => match.side === 'context');

    expect(contextMatch).toBeDefined();
    expect(contextMatch?.lineNumber).toBe(11);
    expect(contextMatch?.altLineNumber).toBe(11);
  });

  it('groups matches by file in original file order', () => {
    const matches = findReviewSearchMatches(diffFiles, 'searchterm');
    const groups = groupReviewSearchMatches(diffFiles, matches);

    expect(groups).toHaveLength(2);
    expect(groups.map(group => [group.filePath, group.fileIndex, group.matches.length])).toEqual([
      ['src/alpha.ts', 0, 4],
      ['src/beta.ts', 1, 1],
    ]);
  });

  it('returns short labels for diff sides', () => {
    expect(getReviewSearchSideLabel('addition')).toBe('new');
    expect(getReviewSearchSideLabel('deletion')).toBe('old');
    expect(getReviewSearchSideLabel('context')).toBe('ctx');
  });
});

const patchFile = (path: string, patch: string): ReviewSearchableDiffFile => ({
  path,
  patch,
  additions: 0,
  deletions: 0,
});

describe("reviewSearch - workspace mode with repo-prefixed paths", () => {
  const samplePatch = [
    "diff --git a/src/index.ts b/src/index.ts",
    "--- a/src/index.ts",
    "+++ b/src/index.ts",
    "@@ -1,3 +1,3 @@",
    " function greet() {",
    "-  return 'hello';",
    "+  return 'hello world';",
    " }",
  ].join("\n");

  it("builds search index with repo-prefixed file paths", () => {
    const files = [
      patchFile("repo-a/src/index.ts", samplePatch),
      patchFile("repo-b/src/index.ts", samplePatch),
    ];
    const index = buildSearchIndex(files);

    // All lines should have repo-prefixed file paths
    expect(index.every(line => line.filePath.startsWith("repo-"))).toBe(true);
    expect(index.some(line => line.filePath === "repo-a/src/index.ts")).toBe(true);
    expect(index.some(line => line.filePath === "repo-b/src/index.ts")).toBe(true);
  });

  it("finds matches across different repos with same relative path", () => {
    const files = [
      patchFile("repo-a/src/utils.ts", [
        "diff --git a/src/utils.ts b/src/utils.ts",
        "@@ -1 +1 @@",
        "-const x = 1;",
        "+const x = 2;",
      ].join("\n")),
      patchFile("repo-b/src/utils.ts", [
        "diff --git a/src/utils.ts b/src/utils.ts",
        "@@ -1 +1 @@",
        "-const y = 1;",
        "+const y = 2;",
      ].join("\n")),
    ];
    const matches = findReviewSearchMatches(files, "const");

    // Should find matches in both repos
    const repoAMatches = matches.filter(m => m.filePath === "repo-a/src/utils.ts");
    const repoBMatches = matches.filter(m => m.filePath === "repo-b/src/utils.ts");

    expect(repoAMatches.length).toBeGreaterThan(0);
    expect(repoBMatches.length).toBeGreaterThan(0);
  });

  it("distinguishes same content in different repos", () => {
    const files = [
      patchFile("repo-a/src/index.ts", [
        "diff --git a/src/index.ts b/src/index.ts",
        "@@ -1 +1 @@",
        "-old content",
        "+new content",
      ].join("\n")),
      patchFile("repo-b/src/index.ts", [
        "diff --git a/src/index.ts b/src/index.ts",
        "@@ -1 +1 @@",
        "-old content",
        "+new content",
      ].join("\n")),
    ];
    const matches = findReviewSearchMatches(files, "content");

    // Should have separate match entries for each repo
    const repoAIds = matches.filter(m => m.filePath === "repo-a/src/index.ts");
    const repoBIds = matches.filter(m => m.filePath === "repo-b/src/index.ts");

    expect(repoAIds.length).toBe(2); // "old content" and "new content"
    expect(repoBIds.length).toBe(2);

    // IDs should be different
    const repoAIdSet = new Set(repoAIds.map(m => m.id));
    const repoBIdSet = new Set(repoBIds.map(m => m.id));
    expect([...repoAIdSet].filter(id => repoBIdSet.has(id)).length).toBe(0);
  });

  it("handles deeply nested repo labels in search", () => {
    const files = [
      patchFile("packages/shared/utils/helpers.ts", [
        "diff --git a/utils/helpers.ts b/utils/helpers.ts",
        "@@ -1 +1 @@",
        "-helper function",
        "+improved helper",
      ].join("\n")),
    ];
    const matches = findReviewSearchMatches(files, "helper");

    expect(matches.length).toBe(2);
    expect(matches.every(m => m.filePath === "packages/shared/utils/helpers.ts")).toBe(true);
  });

  it("groups matches by repo-prefixed file path", () => {
    const files = [
      patchFile("repo-a/src/index.ts", samplePatch),
      patchFile("repo-b/src/other.ts", [
        "diff --git a/src/other.ts b/src/other.ts",
        "@@ -1 +1 @@",
        "-hello there",
        "+goodbye there",
      ].join("\n")),
    ];
    const matches = findReviewSearchMatches(files, "hello");
    const groups = groupReviewSearchMatches(files, matches);

    // "hello" appears in both files (repo-a: "hello world", repo-b: "hello there")
    expect(groups).toHaveLength(2);
    const paths = groups.map(g => g.filePath).sort();
    expect(paths).toEqual(["repo-a/src/index.ts", "repo-b/src/other.ts"]);
  });

  it("maintains correct file indices with repo-prefixed paths", () => {
    const files = [
      patchFile("repo-a/src/a.ts", samplePatch),
      patchFile("repo-b/src/b.ts", samplePatch),
      patchFile("repo-c/src/c.ts", samplePatch),
    ];
    const matches = findReviewSearchMatches(files, "hello");
    const groups = groupReviewSearchMatches(files, matches);

    // Each group should have correct file index
    const groupA = groups.find(g => g.filePath === "repo-a/src/a.ts");
    const groupB = groups.find(g => g.filePath === "repo-b/src/b.ts");
    const groupC = groups.find(g => g.filePath === "repo-c/src/c.ts");

    expect(groupA?.fileIndex).toBe(0);
    expect(groupB?.fileIndex).toBe(1);
    expect(groupC?.fileIndex).toBe(2);
  });

  it("handles search in nested repo labels (longest prefix)", () => {
    const files = [
      patchFile("apps/api/src/server.ts", [
        "diff --git a/src/server.ts b/src/server.ts",
        "@@ -1 +1 @@",
        "-server code",
        "+better server",
      ].join("\n")),
      patchFile("apps/web/src/app.ts", [
        "diff --git a/src/app.ts b/src/app.ts",
        "@@ -1 +1 @@",
        "-app code",
        "+better app",
      ].join("\n")),
    ];
    const matches = findReviewSearchMatches(files, "code");

    const apiMatch = matches.find(m => m.filePath === "apps/api/src/server.ts");
    const webMatch = matches.find(m => m.filePath === "apps/web/src/app.ts");

    expect(apiMatch).toBeDefined();
    expect(webMatch).toBeDefined();
  });

  it("returns empty results for non-matching query in workspace", () => {
    const files = [
      patchFile("repo-a/src/index.ts", samplePatch),
    ];
    const matches = findReviewSearchMatches(files, "nonexistent");

    expect(matches).toHaveLength(0);
  });

  it("handles empty file list in workspace mode", () => {
    const index = buildSearchIndex([]);
    expect(index).toHaveLength(0);

    const matches = findMatchesInIndex(index, "query");
    expect(matches).toHaveLength(0);
  });

  it("handles multiple matches on same line in same repo", () => {
    const files = [
      patchFile("repo-a/src/index.ts", [
        "diff --git a/src/index.ts b/src/index.ts",
        "@@ -1 +1 @@",
        "-foo bar foo",
        "+foo baz foo",
      ].join("\n")),
    ];
    const matches = findReviewSearchMatches(files, "foo");

    // Should find 4 matches (2 on old line, 2 on new line)
    expect(matches.length).toBe(4);
    expect(matches.every(m => m.filePath === "repo-a/src/index.ts")).toBe(true);
  });
});
