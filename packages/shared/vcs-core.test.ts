import { describe, expect, test } from "bun:test";
import type {
  DiffResult,
  DiffType,
  GitContext,
  ReviewGitRuntime,
} from "./review-core";
import {
  type VcsProvider,
  createGitProvider,
  createVcsApi,
  resolveInitialDiffType,
} from "./vcs-core";

function context(overrides: Partial<GitContext>): GitContext {
  return {
    currentBranch: "feature",
    defaultBranch: "main",
    diffOptions: [
      { id: "uncommitted", label: "Uncommitted changes" },
      { id: "merge-base", label: "Committed changes" },
    ],
    worktrees: [],
    availableBranches: { local: [], remote: [] },
    vcsType: "git",
    ...overrides,
  };
}

function provider(
  id: string,
  detected: boolean | (() => boolean),
  ownedTypes: string[],
  contextOverrides: Partial<GitContext> = {},
  root?: string,
): VcsProvider {
  const isDetected = () => typeof detected === "function" ? detected() : detected;
  return {
    id,
    async detect() {
      return isDetected();
    },
    async getRoot() {
      return isDetected() ? root ?? "/repo" : null;
    },
    ownsDiffType(diffType: string) {
      return ownedTypes.includes(diffType);
    },
    async getContext() {
      return context({ vcsType: id as GitContext["vcsType"], ...contextOverrides });
    },
    async runDiff(diffType: DiffType, defaultBranch: string): Promise<DiffResult> {
      return { patch: `${id}:${diffType}:${defaultBranch}`, label: `${id}:${defaultBranch}` };
    },
    async getFileContents() {
      return { oldContent: id, newContent: id };
    },
  };
}

const gitRuntime: ReviewGitRuntime = {
  async getFileInfo() {
    return null;
  },
  async readLink() {
    return null;
  },
  async runGit() {
    return { stdout: "", stderr: "", exitCode: 0 };
  },
  async readTextFile() {
    return null;
  },
};

describe("createVcsApi", () => {
  test("detects the nearest VCS root so nested repos beat outer workspaces", async () => {
    const outerGit = provider("git", true, ["uncommitted"], { cwd: "/repo" }, "/repo");
    const innerGit = provider("git", true, ["uncommitted"], { cwd: "/repo/packages/tool" }, "/repo/packages/tool");
    const api = createVcsApi([outerGit, innerGit]);

    await expect(api.detectVcs("/repo/packages/tool")).resolves.toBe(innerGit);
    await expect(api.getVcsContext("/repo/packages/tool")).resolves.toMatchObject({ vcsType: "git" });
  });

  test("continues probing providers when root detection throws", async () => {
    const brokenGit = {
      ...provider("broken", true, ["uncommitted"]),
      async getRoot() {
        throw new Error("git failed");
      },
    };
    const git = provider("git", true, ["merge-base"], {}, "/repo");
    const api = createVcsApi([brokenGit, git]);

    await expect(api.detectVcs("/repo")).resolves.toBe(git);
    await expect(api.getVcsContext("/repo")).resolves.toMatchObject({ vcsType: "git" });
  });

  test("detectManagedVcs returns null instead of falling back when no provider detects a workspace", async () => {
    const git = provider("git", false, ["uncommitted"]);
    const api = createVcsApi([git]);

    await expect(api.detectManagedVcs("/not-a-repo")).resolves.toBeNull();
    await expect(api.detectVcs("/not-a-repo")).resolves.toBe(git);
  });

  test("detectManagedVcs respects forced VCS selection without throwing", async () => {
    const git = provider("git", true, ["uncommitted"], {}, "/repo");
    const api = createVcsApi([git]);

    await expect(api.detectManagedVcs("/repo", "git")).resolves.toBe(git);
  });

  test("detectManagedVcs returns null when forced provider detection throws", async () => {
    const git = {
      ...provider("git", true, ["uncommitted"]),
      async detect() {
        throw new Error("git failed");
      },
    };
    const api = createVcsApi([git]);

    await expect(api.detectManagedVcs("/repo", "git")).resolves.toBeNull();
  });

  test("routes operations by diff type before falling back to detection", async () => {
    const custom = provider("custom", false, ["custom-diff"]);
    const git = provider("git", true, ["uncommitted"]);
    const api = createVcsApi([custom, git]);

    await expect(api.runVcsDiff("custom-diff" as any, "main", "/repo")).resolves.toMatchObject({
      patch: "custom:custom-diff:main",
    });
    await expect(api.runVcsDiff("uncommitted", "main", "/repo")).resolves.toMatchObject({
      patch: "git:uncommitted:main",
    });
  });

  test("the git provider owns commit:<sha> diff types", () => {
    const git = createGitProvider(gitRuntime);
    expect(git.ownsDiffType("commit:abc1234")).toBe(true);
    expect(git.ownsDiffType("worktree:/repo:commit:abc1234")).toBe(true);
  });

  test("uses provider context captured atomically with the prepared patch", async () => {
    const initialContext = context({
      vcsType: "git",
      defaultBranch: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      diffOptions: [{ id: "uncommitted", label: "Uncommitted" }],
    });
    const patchContext = context({
      vcsType: "git",
      defaultBranch: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      diffOptions: [{ id: "uncommitted", label: "Uncommitted" }],
    });
    const git: VcsProvider = {
      ...provider("git", true, ["uncommitted"]),
      async getContext() {
        return initialContext;
      },
      async runDiff() {
        return {
          patch: "atomic patch",
          label: "Uncommitted",
          gitContext: patchContext,
          fingerprint: "atomic fingerprint",
        };
      },
    };
    const api = createVcsApi([git]);

    await expect(api.prepareLocalReviewDiff({
      cwd: "/repo",
      configuredDiffType: "uncommitted",
    })).resolves.toMatchObject({
      gitContext: patchContext,
      base: patchContext.defaultBranch,
      rawPatch: "atomic patch",
      fingerprint: "atomic fingerprint",
    });
  });

  test("prepares Git local reviews by honoring valid requested base and ignoring invalid diff modes", async () => {
    const git = provider("git", true, ["uncommitted", "merge-base"]);
    const api = createVcsApi([git]);

    await expect(api.prepareLocalReviewDiff({
      cwd: "/repo",
      requestedDiffType: "invalid-diff" as any,
      requestedBase: "develop",
      configuredDiffType: "merge-base",
    })).resolves.toMatchObject({
      diffType: "merge-base",
      base: "develop",
      rawPatch: "git:merge-base:develop",
    });
  });

  test("reports a clear error when forced Git is unavailable", async () => {
    const git = provider("git", false, ["uncommitted", "merge-base"]);
    const api = createVcsApi([git]);

    await expect(api.prepareLocalReviewDiff({
      cwd: "/repo",
      vcsType: "git",
      configuredDiffType: "merge-base",
    })).rejects.toThrow("Git workspace not found.");
  });

  test("refreshes context and remote defaults with the forced VCS", async () => {
    const git = {
      ...provider("git", true, ["uncommitted", "merge-base"]),
      detectRemoteDefaultCompareTarget: async () => "origin/main",
    };
    const api = createVcsApi([git]);

    await expect(api.getVcsContext("/repo", "git")).resolves.toMatchObject({
      vcsType: "git",
      defaultBranch: "main",
    });
    await expect(api.detectRemoteDefaultCompareTarget("/repo", "git")).resolves.toBe("origin/main");
  });
});

describe("resolveInitialDiffType", () => {
  test("preserves configured Git diff modes when available", () => {
    expect(resolveInitialDiffType(context({}), "merge-base")).toBe("merge-base");
  });

  test("falls back to the first available option for unknown diff modes", () => {
    expect(resolveInitialDiffType(context({}), "invalid-mode" as any)).toBe("uncommitted");
  });
});
