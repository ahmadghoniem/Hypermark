import {
  createGitProvider,
  createVcsApi,
  resolveInitialDiffType,
} from "@hypermark/shared/vcs-core";
import { runtime as gitRuntime } from "./git";

const api = createVcsApi([
  createGitProvider(gitRuntime),
]);

export const {
  detectVcs,
  detectManagedVcs,
  vcsOwnsDiffType,
  getVcsContext,
  detectRemoteDefaultCompareTarget,
  prepareLocalReviewDiff,
  runVcsDiff,
  getVcsFileContentsForDiff,
  getVcsDiffFingerprint,
  resolveVcsCwd,
  vcsSupportsSnapshot,
  materializeVcsSnapshot,
} = api;

export { resolveInitialDiffType, gitRuntime };

export type {
  DiffOption,
  DiffType,
  GitContext,
  GitDiffOptions,
  VcsProvider,
  VcsSelection,
  WorktreeInfo,
} from "@hypermark/shared/vcs-core";

export {
  parseCommitDiffType,
  parseRemoteBookmark,
  parseWorktreeDiffType,
  validateFilePath,
} from "@hypermark/shared/vcs-core";
