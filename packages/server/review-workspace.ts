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
} from "@plannotator/shared/review-workspace";

export {
  WorkspaceReviewSession,
  isRepoRelative,
  mapRepoDiffTypeToWorkspaceMode,
  mapWorkspaceModeToRepoDiffType,
  resolveWorkspaceInitialDiffType,
  type WorkspaceDiffType,
  type WorkspaceRepoRuntimeState,
  type WorkspaceReviewPromptContext,
} from "@plannotator/shared/review-workspace";

export {
  aggregateWorkspacePatch,
  discoverWorkspaceRepoPaths,
  prefixWorkspacePatchPaths as prefixPatchPaths,
  resolveWorkspaceFilePath,
  type WorkspacePatchAggregate,
} from "@plannotator/shared/review-workspace-node";

export type LocalWorkspaceReview = WorkspaceReviewSession;

const workspaceRuntime = {
  async detectVcsType(cwd?: string) {
    return (await detectManagedVcs(cwd))?.id;
  },
  getVcsContext,
  runVcsDiff,
  getVcsFileContentsForDiff,
  getVcsDiffFingerprint,
  // Staging was removed with the stage/unstage mutation routes (spec 02 step
  // 4). The shared workspace contract still declares these members, so they
  // are wired fail-closed rather than to a real index mutation: no server path
  // can stage or unstage, and a future caller gets a refusal, never a silent
  // write to the git index.
  canStageFiles: async (): Promise<boolean> => false,
  stageFile: async (): Promise<void> => {
    throw new Error("Staging is not available");
  },
  unstageFile: async (): Promise<void> => {
    throw new Error("Staging is not available");
  },
};

export async function buildLocalWorkspaceReview(
  root: string,
  options: WorkspaceReviewBuildOptions = {},
): Promise<WorkspaceReviewSession> {
  return WorkspaceReviewSession.create(workspaceRuntime, root, options);
}
