import {
  detectManagedVcs,
  getVcsContext,
  getVcsDiffFingerprint,
  getVcsFileContentsForDiff,
  runVcsDiff,
} from "./vcs";
import {
  WorkspaceReviewSession,
  type WorkspaceReviewBuildOptions,
} from "@hypermark/shared/review-workspace";

export {
  WorkspaceReviewSession,
  isRepoRelative,
  mapRepoDiffTypeToWorkspaceMode,
  mapWorkspaceModeToRepoDiffType,
  resolveWorkspaceInitialDiffType,
  type WorkspaceDiffType,
  type WorkspaceRepoRuntimeState,
  type WorkspaceReviewPromptContext,
} from "@hypermark/shared/review-workspace";

export {
  aggregateWorkspacePatch,
  discoverWorkspaceRepoPaths,
  prefixWorkspacePatchPaths as prefixPatchPaths,
  resolveWorkspaceFilePath,
  type WorkspacePatchAggregate,
} from "@hypermark/shared/review-workspace-node";

export type LocalWorkspaceReview = WorkspaceReviewSession;

const workspaceRuntime = {
  async detectVcsType(cwd?: string) {
    return (await detectManagedVcs(cwd))?.id;
  },
  getVcsContext,
  runVcsDiff,
  getVcsFileContentsForDiff,
  getVcsDiffFingerprint,
};

export async function buildLocalWorkspaceReview(
  root: string,
  options: WorkspaceReviewBuildOptions = {},
): Promise<WorkspaceReviewSession> {
  return WorkspaceReviewSession.create(workspaceRuntime, root, options);
}
