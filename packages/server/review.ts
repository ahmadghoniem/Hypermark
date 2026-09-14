/**
 * Code Review Server
 *
 * Provides a server implementation for code review with git diff rendering.
 * Follows the same patterns as the plan server.
 *
 * Environment variables:
 *   HYPERMARK_PORT   - Fixed port or inclusive range (default: random)
 */

import { getServerHostname, startBunServerOnAvailablePort, buildAdvertisedUrl } from "./server-port";
import type { Origin } from "@hypermark/shared/agents";
import { type DiffType, type GitContext, runVcsDiff, getVcsFileContentsForDiff, getVcsDiffFingerprint, resolveVcsCwd, validateFilePath, getVcsContext, detectRemoteDefaultCompareTarget, vcsOwnsDiffType, gitRuntime } from "./vcs";
import { basename } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { SingleFlight } from "@hypermark/shared/single-flight";
import {
  isSameCwdCommitSwitch,
  parseCommitDiffType,
  parseWorktreeDiffType,
  resolveBaseBranch,
  getSinceBaseSections,
  detectRemoteDefaultInfo,
  isBinaryPatchFile,
  listPatchFiles,
  type RemoteDefaultInfo,
  type SinceBaseSections,
} from "@hypermark/shared/review-core";
import {
  getGitButlerContextRevision,
  getGitButlerPatchFingerprint,
} from "@hypermark/shared/gitbutler-core";
import {
  getCommitDiffInfo,
  listCommitHistory,
  type CommitDiffInfo,
} from "@hypermark/shared/commit-history";
import { createCommitAvatarResolver, type CommandRunner } from "@hypermark/shared/commit-avatars";
import { detectGeneratedFiles, detectGeneratedFilesByName } from "@hypermark/shared/generated-files";
import { getRepoInfo } from "./repo";
import { handleImage, handleUpload, handleServerReady, handleDraftSave, handleDraftLoad, handleDraftDelete, handleApiNotFound, handleFavicon, readDraftGenerationFromBody, readDraftGenerationFromUrl } from "./shared-handlers";
import { contentHash, deleteDraft } from "./draft";
import { createExternalAnnotationHandler } from "./external-annotations";
import { loadConfig, saveConfig, detectGitUser, getServerConfig, resolveFeedbackHistory } from "./config";
import { appendFeedbackRecord, countChangedFiles, deriveFeedbackProject, type FeedbackDecision, type FeedbackReviewTarget } from "@hypermark/shared/feedback-archive";
import { isFaviconStyle, type FaviconStyle } from "@hypermark/shared/favicon";
import type { LocalWorkspaceReview, WorkspaceDiffType } from "./review-workspace";
import { handleCodeNavResolve, extractChangedFiles } from "./code-nav";
import { SESSION_STREAM_PATH } from "@hypermark/shared/session-stream";
import { createSessionStreamBroadcaster } from "./session-stream";
import { startParentWatch, type ParentWatcher } from "./parent-watch";

// Re-export utilities
export { openBrowser } from "./browser";
export { type DiffType, type DiffOption, type GitContext, type WorktreeInfo } from "./vcs";
export { handleServerReady as handleReviewServerReady } from "./shared-handlers";

// --- Types ---

export interface ReviewServerOptions {
  /** Raw git diff patch string */
  rawPatch: string;
  /** Git ref used for the diff (e.g., "HEAD", "main..HEAD", "--staged") */
  gitRef: string;
  /** Error message if git diff failed */
  error?: string;
  /** HTML content to serve for the UI */
  htmlContent: string;
  /** Origin identifier for UI customization */
  origin?: Origin;
  /** Current diff type being displayed */
  diffType?: DiffType | WorkspaceDiffType;
  /** Git context with branch info and available diff options */
  gitContext?: GitContext;
  /** Local parent directory containing multiple child VCS repositories. */
  workspace?: LocalWorkspaceReview;
  /**
   * Initial base branch the caller used to compute `rawPatch`. When a caller
   * overrides the detected default (e.g. Pi's `openCodeReview` accepting a
   * custom `defaultBranch`), this must be forwarded so the server's internal
   * `currentBase` state, the `/api/diff` response, and downstream agent
   * prompts stay consistent with the patch that's already on screen.
   */
  initialBase?: string;
  /** Freshness token captured atomically with the initial provider patch. */
  initialFingerprint?: string;
  /**
   * Whether this session's decision consumer delivers approve-time feedback
   * (decision-control spec §6.4). Echoed as `approvalNotesSupported` on every
   * diff payload (`/api/diff`, `/api/diff/switch`) so the advert survives a diff
   * switch; the client gates its approve-carrying menu items on it. Default false — a caller
   * that does not pass it (an older consumer whose approved branch still discards
   * `result.feedback`) advertises "not capable" and the client renders no
   * approve-carrying items, exactly the pre-PR5 behavior.
   */
  approvalNotesSupported?: boolean;
  /** Called when server starts with the URL, remote status, and port */
  onReady?: (url: string, port: number) => void | Promise<void>;
  /**
   * Detected project name, used to key the durable feedback archive
   * (`feedback/{project}/`). Mirrors the annotate server's `project` option.
   * Callers should pass `detectProjectName()`; without it the server falls
   * back to deriving a name from the review's working directory.
   */
  project?: string;
  /** Working directory for agent processes. Independent of diff pipeline. */
  agentCwd?: string;
  /** Cleanup callback invoked when server stops (e.g., remove temp worktree) */
  onCleanup?: () => void | Promise<void>;
  /**
   * Enable the stale-session reaper (see ./parent-watch.ts). Off by default
   * — see the identical option on AnnotateServerOptions in ./annotate.ts
   * for the full rationale (dozens of tests start this server directly and
   * must not get a background poller they never asked for). Pass `true`
   * in production or an overrides object in tests.
   */
  parentWatch?:
    | boolean
    | {
        parentPid?: number;
        pollIntervalMs?: number;
        graceMs?: number;
        isAlive?: (pid: number) => boolean;
      };
}

export interface ReviewServerResult {
  /** The port the server is running on */
  port: number;
  /** The full URL to access the server */
  url: string;
  /** Wait for user review decision */
  waitForDecision: () => Promise<{
    approved: boolean;
    feedback: string;
    annotations: unknown[];
    exit?: boolean;
  }>;
  /** Stop the server */
  stop: () => void;
}

// --- Server Implementation ---

/**
 * Start the Code Review server
 *
 * Handles:
 * - Remote detection and port configuration
 * - API routes (/api/diff, /api/feedback)
 * - Port conflict retries
 */
export async function startReviewServer(
  options: ReviewServerOptions
): Promise<ReviewServerResult> {
  const { htmlContent, origin, gitContext, onReady } = options;
  // Session-constant capability advert; rides every diff payload (see the
  // option's doc). Absent option = false, so old callers advertise honestly.
  const approvalNotesSupported = options.approvalNotesSupported === true;

  const workspace = options.workspace;
  const isWorkspaceMode = !!workspace;
  const hasLocalAccess = !!gitContext;
  const sessionVcsType = gitContext?.vcsType;
  let clientGitContext = gitContext;
  let draftKey = contentHash(options.rawPatch);
  const externalAnnotations = createExternalAnnotationHandler("review");

  // Mutable state for diff switching
  let currentPatch = options.rawPatch;
  let currentGitRef = options.gitRef;
  let currentDiffType: DiffType | WorkspaceDiffType = options.diffType || workspace?.diffType || "uncommitted";
  let currentError = options.error;
  let currentHideWhitespace = loadConfig().diffOptions?.hideWhitespace ?? false;
  // Monotonic guard for /api/diff/switch: concurrent switches mutate shared
  // state across awaits, so a slower earlier request could overwrite a newer
  // one's snapshot and hand the client a self-consistent-but-wrong diff. A
  // superseded request writes nothing and returns { superseded: true }.
  let diffSwitchEpoch = 0;
  // Tracks the base branch the user picked from the UI. Agent review prompts
  // read this (not gitContext.defaultBranch) so they analyze the same diff
  // the reviewer is currently looking at. Honors an explicit initialBase from
  // the caller — e.g. programmatic Pi callers can request a non-detected base.
  const detectedCompareTarget = (): string => gitContext?.defaultBranch || gitContext?.compareTarget?.fallback || "main";
  let currentBase = options.initialBase || detectedCompareTarget();
  const isGitButlerCommittedView = (diffType: string = currentDiffType as string): boolean =>
    diffType.startsWith("gitbutler:stack:") || diffType.startsWith("gitbutler:branch:");
  let baseEverSwitched = false;
  // True once the user picks a base from the picker (explicitBase on the
  // switch body). Disables the bare-local-name → origin/* canonicalization:
  // the picker offers local and remote refs as distinct choices, so an
  // explicit local pick must be honored even when the two point at
  // different commits.
  let baseExplicitlyChosen = false;

  // --- Diff staleness fingerprint -------------------------------------------
  // Captured beside every patch snapshot (startup + every switch endpoint);
  // GET /api/diff/fresh recomputes and compares so the client can show a
  // "diff out of date — refresh" notice when files change mid-review (e.g. an
  // agent editing/committing while the user reviews). Best-effort everywhere:
  // null means "cannot fingerprint" and is reported as fresh, never stale.
  let currentFingerprint = options.initialFingerprint ?? getGitButlerPatchFingerprint(
      currentDiffType as DiffType,
      currentPatch,
      clientGitContext,
    );
  const computeDiffFingerprint = async (): Promise<string | null> => {
    try {
      if (workspace) return await workspace.getFingerprint();
      if (!hasLocalAccess) return null;
      return await getVcsDiffFingerprint(currentDiffType as DiffType, currentBase, gitContext?.cwd, {
        hideWhitespace: currentHideWhitespace,
      });
    } catch {
      return null;
    }
  };
  // Fire-and-forget capture: never delays the snapshot response it describes.
  // Generation-guarded: two rapid switches can resolve their captures out of
  // order — only the LATEST capture may write the baseline, otherwise a stale
  // fingerprint would make /api/diff/fresh report stale forever.
  let fingerprintGeneration = 0;
  let pendingFingerprintCapture: Promise<string | null> | null = null;
  const fileContentFingerprintProbes = new SingleFlight<string | null>();
  const captureDiffFingerprint = (knownFingerprint?: string): void => {
    fileContentFingerprintProbes.clear();
    const generation = ++fingerprintGeneration;
    if (knownFingerprint !== undefined) {
      currentFingerprint = knownFingerprint;
      pendingFingerprintCapture = null;
      return;
    }
    // The previous snapshot's fingerprint must never be treated as the new
    // snapshot's baseline while this capture is in flight. File expansion can
    // await this exact promise when it needs a trustworthy baseline.
    currentFingerprint = null;
    const capture = computeDiffFingerprint();
    pendingFingerprintCapture = capture;
    void capture.then((fingerprint) => {
      if (generation === fingerprintGeneration) {
        currentFingerprint = fingerprint;
        pendingFingerprintCapture = null;
      }
    });
  };
  if (currentFingerprint === null) captureDiffFingerprint();

  const resolveReviewBase = (
    requestedBase?: string,
    explicitlyChosen = baseExplicitlyChosen,
    activeBase = currentBase,
  ): string => {
    const resolved = resolveBaseBranch(requestedBase, detectedCompareTarget());
    // Canonicalize a bare local default name ("main") to its tracking ref
    // ("origin/main"). The startup upgrade races the first /api/diff, so a
    // client that loaded early re-sends the un-upgraded "main" on the next
    // switch/refresh; without this the server would revert to the stale local
    // branch and lose the upstream baseline. Only when the remote default is
    // known, the requested base is exactly its local name, AND the user has
    // never explicitly picked a base — an explicit local pick (and every
    // echo after it) is honored verbatim.
    const remoteBranch = remoteDefaultInfo?.branch;
    if (
      !explicitlyChosen &&
      remoteBranch &&
      remoteBranch.startsWith("origin/") &&
      resolved === remoteBranch.replace(/^origin\//, "")
    ) {
      return remoteBranch;
    }
    // Second rule, independent of remoteDefaultInfo: if the SESSION is
    // already on the upgraded tracking ref and a non-explicit request echoes
    // its bare local name, stay on the tracking ref. remoteDefaultInfo comes
    // from a SECOND probe that can lag the startup upgrade by seconds — in
    // that window the rule above is blind, and a diff-type/whitespace switch
    // echoing "main" would commit the session back onto the stale local
    // branch (and set baseEverSwitched, permanently blocking the upgrade).
    if (!explicitlyChosen && activeBase === `origin/${resolved}`) {
      return activeBase;
    }
    return resolved;
  };

  // --- Base staleness vs the remote ----------------------------------------
  // `origin/<default>` is GitHub's state as of the last fetch. The startup
  // ls-remote (below) also carries the remote tip SHA; comparing it to the
  // local tracking ref tells us whether the baseline is behind. Surfaced as
  // `baseBehindRemote` on diff payloads and the freshness probe, refreshed
  // lazily at most once a minute (it is a network call, unlike the 5s
  // fingerprint probe).
  let remoteDefaultInfo: RemoteDefaultInfo | null = null;
  let baseBehindRemote = false;
  let lastRemoteBaseCheck = 0;
  const REMOTE_BASE_CHECK_INTERVAL_MS = 60_000;
  const remoteBaseCheckApplies = (): boolean =>
    !!gitContext && (!sessionVcsType || sessionVcsType === "git");

  // The "behind GitHub" check is only meaningful for diff types that actually
  // compare against a base (since-base / branch / merge-base). Under
  // uncommitted/staged/last-commit/all the base ref is irrelevant, so the
  // banner must not show.
  const baseRelevantDiffType = (diffType: string = currentDiffType as string): boolean => {
    const t = parseWorktreeDiffType(diffType)?.subType ?? diffType;
    return t === "since-base" || t === "branch" || t === "merge-base";
  };

  // Local-only computation from the cached remote tip — no network. Parameters
  // let switch handlers evaluate a staged snapshot before committing it.
  const computeBaseBehindRemote = async (
    base: string = currentBase,
    diffType: string = currentDiffType as string,
    explicitlyChosen = baseExplicitlyChosen,
  ): Promise<boolean> => {
    // Capture once: a concurrent refreshRemoteBaseInfo can null
    // remoteDefaultInfo (transient ls-remote failure) during the rev-parse
    // await below — reading the global after it would throw.
    const remoteInfo = remoteDefaultInfo;
    if (!remoteBaseCheckApplies() || !baseRelevantDiffType(diffType) || !remoteInfo?.remoteHeadSha) {
      return false;
    }
    // Meaningful only when the base we're diffing against IS the remote default
    // branch — matched as either its local name ("main") or the tracking ref
    // ("origin/main"). Comparing by RESOLVED SHA (not ref-name string) is what
    // makes this correct when currentBase is the bare local name, which is the
    // case whenever origin/HEAD's local symref isn't set (Pi forwards that
    // local name as initialBase; the hook upgrades to origin/*).
    //
    // A local name the user EXPLICITLY picked is exempt: they chose the local
    // ref over origin/* on purpose, and Fetch advances origin/* — the banner
    // would be un-clearable nagging about a deliberate choice (same treatment
    // as any non-default base).
    const remoteBranch = remoteInfo.branch;
    const localName = remoteBranch.replace(/^origin\//, "");
    const matchesDefault =
      base === remoteBranch ||
      (base === localName && !explicitlyChosen);
    if (!matchesDefault) {
      return false;
    }
    // --verify: without it, `rev-parse --end-of-options <ref>` echoes the flag
    // as a literal first output line, so .trim() could never equal the SHA and
    // baseBehindRemote was stuck true on every repo with a remote.
    const local = await gitRuntime.runGit(
      ["--no-optional-locks", "rev-parse", "--verify", "--end-of-options", base],
      { cwd: gitContext?.cwd },
    );
    return local.exitCode === 0 && local.stdout.trim() !== remoteInfo.remoteHeadSha;
  };

  const recomputeBaseBehindRemote = async (): Promise<void> => {
    baseBehindRemote = await computeBaseBehindRemote();
  };

  const refreshRemoteBaseInfo = async (): Promise<void> => {
    if (!remoteBaseCheckApplies()) return;
    lastRemoteBaseCheck = Date.now();
    remoteDefaultInfo = await detectRemoteDefaultInfo(gitRuntime, gitContext?.cwd);
    await recomputeBaseBehindRemote();
  };

  const maybeRefreshRemoteBaseInfo = (): void => {
    if (!remoteBaseCheckApplies()) return;
    if (Date.now() - lastRemoteBaseCheck < REMOTE_BASE_CHECK_INTERVAL_MS) return;
    lastRemoteBaseCheck = Date.now();
    void refreshRemoteBaseInfo().catch(() => {});
  };

  // Two independent startup probes (decoupled so a forwarded initialBase can't
  // suppress the staleness check — the Pi divergence):
  //  1. Always probe remote staleness once at boot.
  //  2. Upgrade currentBase to the upstream tracking ref ("origin/main") when
  //     no explicit base was requested, OR when the forwarded base is just the
  //     bare LOCAL name of that same default ("main"). Only origin/* is
  //     fetchable — leaving currentBase as bare "main" makes the "behind GitHub"
  //     banner un-clearable, since Fetch advances origin/main, not local main.
  //     Canonicalizing "main" -> "origin/main" is safe; it never overrides a
  //     deliberately-chosen different base (a feature branch is left as-is).
  if (gitContext) {
    detectRemoteDefaultCompareTarget(gitContext.cwd, sessionVcsType).then(
      async (remote) => {
        if (remote && !baseEverSwitched && currentBase !== remote) {
          const localName = remote.replace(/^origin\//, "");
          if (!options.initialBase || currentBase === localName) {
            // Rebuild the diff for the upgraded base BEFORE swapping it in, and
            // commit base+patch+ref+fingerprint together — otherwise the initial
            // patch (built against the old base by the caller) would be served
            // under the new base label: a mixed-base review. Skip if the user
            // switched meanwhile. The fingerprint change makes the client's
            // freshness poll pick up the rebuilt diff.
            try {
              const rebuilt = await runVcsDiff(
                currentDiffType as DiffType,
                remote,
                gitContext.cwd,
                { hideWhitespace: currentHideWhitespace },
              );
              if (!baseEverSwitched) {
                currentBase = remote;
                currentPatch = rebuilt.patch;
                currentGitRef = rebuilt.label;
                currentError = rebuilt.error;
                // draftKey doubles as the snapshot id the freshness probe
                // compares against each client's echoed ?snapshot= — a client
                // that loaded the pre-upgrade patch mismatches and gets the
                // "Diff out of date · Refresh" banner; later loads carry the
                // new id and stay fresh. That per-client signal is what lets
                // the fingerprint re-baseline unconditionally here.
                draftKey = contentHash(currentPatch);
                captureDiffFingerprint();
              }
            } catch {
              /* keep the initial base+patch — they still match each other */
            }
          }
        }
        void refreshRemoteBaseInfo().catch(() => {});
      },
      () => {
        void refreshRemoteBaseInfo().catch(() => {});
      },
    );
  }

  // Commit-author avatar resolution for /api/commits — session-scoped so the
  // forge lookups (gh/glab) and their failures are paid at most once.
  const bunCommandRunner: CommandRunner = {
    async runCommand(cmd, args) {
      const proc = Bun.spawn([cmd, ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return { stdout, stderr, exitCode };
    },
  };
  const commitAvatars = createCommitAvatarResolver(bunCommandRunner);

  // --- Since-base sections sidecar ------------------------------------------
  // Groups the composite since-base patch's files by lifecycle state
  // (committed / changes / untracked) for the three-stack panel. Only
  // computed when the since-base mode (or its worktree variant) is active.
  const isSinceBaseActive = (diffType: string = currentDiffType as string): boolean => {
    if (workspace || !gitContext) return false;
    const effective = parseWorktreeDiffType(diffType)?.subType ?? diffType;
    return effective === "since-base";
  };
  // Base AND diff type are parameterized so callers can pin them to a
  // snapshot taken before an await — reading the globals inside would race
  // the startup base upgrade and concurrent diff-type switches.
  const buildSectionsSidecar = async (
    base: string = currentBase,
    diffType: string = currentDiffType as string,
  ): Promise<SinceBaseSections | undefined> => {
    if (!isSinceBaseActive(diffType)) return undefined;
    const cwd = resolveVcsCwd(diffType as DiffType, gitContext?.cwd);
    return (await getSinceBaseSections(gitRuntime, base, cwd)) ?? undefined;
  };

  // --- Commit metadata sidecar -----------------------------------------------
  // When a commit:<sha> diff is active, the full commit message (rendered as
  // markdown client-side) heads the all-files view. Same mode-conditional
  // shape as the sections sidecar; avatar enrichment reuses the session cache.
  // diffType parameterized for the same pin-before-await discipline as
  // buildSectionsSidecar.
  const buildCommitInfoSidecar = async (diffType: string = currentDiffType as string): Promise<CommitDiffInfo | undefined> => {
    if (workspace || !gitContext) return undefined;
    const effective = parseWorktreeDiffType(diffType)?.subType ?? diffType;
    const sha = parseCommitDiffType(effective as string)?.sha;
    if (!sha) return undefined;
    const cwd = resolveVcsCwd(diffType as DiffType, gitContext.cwd);
    const info = await getCommitDiffInfo(gitRuntime, sha, cwd);
    if (!info) return undefined;
    const avatars = await commitAvatars.resolve(cwd, [info.authorEmail]);
    const avatarUrl = avatars.get(info.authorEmail);
    return avatarUrl ? { ...info, avatarUrl } : info;
  };

  // --- Generated-files sidecar (#1317) ---------------------------------------
  // Two-layer generated detection for the served patch's paths so the client
  // can collapse those diffs by default, GitHub-style: built-in name defaults
  // (lockfiles, minified assets — no git needed) refined by `.gitattributes`
  // `linguist-generated`, which wins in both directions (set marks, unset
  // un-marks even a built-in name, unspecified keeps the default).
  // Presentation-layer only: the patch is never filtered and snapshot/
  // fingerprint semantics are untouched. Attribute refinement runs for plain
  // local Git sessions only — workspace multi-repo, jj,
  // GitButler, and P4 get the name-based defaults alone rather than guessing
  // attributes for a tree git can't authoritatively resolve here. Patch and
  // diff type are parameterized for the same pin-before-await discipline as
  // buildSectionsSidecar.
  const buildGeneratedFilesSidecar = async (
    patch: string = currentPatch,
    diffType: string = currentDiffType as string,
  ): Promise<string[] | undefined> => {
    const paths = listPatchFiles(patch).map((f) => f.path);
    const plainLocalGit =
      !workspace && gitContext && (sessionVcsType ?? "git") === "git";
    const generated = plainLocalGit
      ? await detectGeneratedFiles(
          gitRuntime,
          resolveVcsCwd(diffType as DiffType, gitContext.cwd),
          paths,
        )
      : detectGeneratedFilesByName(paths);
    return generated.length > 0 ? generated : undefined;
  };

  let serverUrl = "";
  const sessionUploads = new Set<string>();
  const resolveAgentCwd = (): string => {
    if (workspace) return workspace.root;
    return options.agentCwd ?? resolveVcsCwd(currentDiffType as DiffType, gitContext?.cwd) ?? process.cwd();
  };
  const resolveAgentCwdReady = async (): Promise<string> => {
    return resolveAgentCwd();
  };
  // GitButler's picker topology is live session state: stacks and branches can
  // change without changing the currently-rendered patch. Carry a compact
  // revision in the snapshot id so another tab cannot rebaseline the shared
  // fingerprint and make an old picker look fresh. Ordinary Git/JJ/P4 snapshot
  // ids remain byte-for-byte unchanged.
  let currentContextRevision = getGitButlerContextRevision(clientGitContext) ?? "";

  // The "changes under review" context for Ask AI, built from the CURRENT view
  // by the SAME machine the launchable review jobs use (buildCommand above) —
  // contextOnly=true so it carries only the changeset/how-to-inspect-it text, no
  // "provide findings" framing. Returned in the diff payloads so the chat can
  // latch it onto the user's messages; recomputed wherever the view changes so a
  // mid-session switch (diff type, base, whitespace) stays accurate.
  // Parameterized so response handlers that SNAPSHOT the served state before
  // an await can build the AI context from that same snapshot — reading the
  // live globals here would let the startup base upgrade hand Ask AI a
  // context for a different changeset than the rendered patch.
  // Snapshot identity clients echo on freshness probes: the content hash
  // PLUS the view mode. Mode is included so a cross-tab mode switch with a
  // byte-identical patch still flags old tabs; the BASE is deliberately
  // excluded so a same-commit base canonicalization (main -> origin/main) stays
  // banner-silent. draftKey itself stays a pure content hash — drafts survive
  // content-identical mode round-trips.
  const currentSnapshotId = (): string =>
    `${draftKey}:${currentDiffType}${currentContextRevision ? `:${currentContextRevision}` : ""}`;

  // --- Durable feedback archive --------------------------------------------
  //
  // Code review was the headline gap: /api/feedback deleted the draft, settled
  // the decision promise, and persisted NOTHING. When the invoking agent had
  // already timed out, the review existed nowhere — the exact failure #678
  // fixed for annotate. Every submission now appends one record to
  // feedback/{project}/index.jsonl (plus a markdown sidecar when it carries
  // content) BEFORE the draft is deleted.
  //
  // Project bucketing: prefer the caller's detected project name.
  const feedbackProject = (): string =>
    options.project?.trim()
      ? options.project
      : deriveFeedbackProject(gitContext?.cwd ?? options.agentCwd ?? process.cwd());

  // Diff IDENTITY only: refs, view, snapshot id, and size metadata. The patch
  // bytes are deliberately not archived (guide history already showed what
  // uncapped patch copies cost); the user can regenerate the diff from these.
  const feedbackReviewTarget = (): FeedbackReviewTarget => {
    const target: FeedbackReviewTarget = {
      diffType: String(currentDiffType),
      base: currentBase,
      gitRef: currentGitRef,
      snapshotId: currentSnapshotId(),
      changedFiles: countChangedFiles(currentPatch),
      patchBytes: currentPatch.length,
    };
    if (sessionVcsType) target.vcsType = sessionVcsType;
    else if (workspace) target.vcsType = "workspace";
    const cwd = gitContext?.cwd ?? options.agentCwd;
    if (cwd) target.cwd = cwd;
    return target;
  };

  /**
   * Append the archive record for one submission.
   *
   * Returns whether the draft delete may proceed: true when the record was
   * written, when the archive is switched off, or when there was no user
   * content to lose; false only when a durable write was expected and failed,
   * in which case the caller keeps the draft as the recovery copy.
   */
  const archiveReviewSubmission = (
    feedback: unknown,
    annotations: unknown,
    decision: FeedbackDecision,
  ): boolean => {
    if (!resolveFeedbackHistory(loadConfig())) return true;
    const feedbackText = typeof feedback === "string" ? feedback : "";
    const annotationList = Array.isArray(annotations) ? annotations : [];
    const hasContent = feedbackText.trim().length > 0 || annotationList.length > 0;
    const written = appendFeedbackRecord({
      project: feedbackProject(),
      origin,
      surface: "review",
      decision,
      target: { review: feedbackReviewTarget() },
      feedback: feedbackText,
      annotations: annotationList,
    });
    // A failed decision-only line has nothing to recover, so it must not
    // change the legacy draft behavior.
    return written !== null || !hasContent;
  };

  const gitUser = detectGitUser();

  // Detect repo info (cached for this session)
  let repoInfo = workspace
    ? { display: basename(workspace.root), branch: "Workspace" }
    : await getRepoInfo();
  if (gitContext?.repository?.displayFallback) {
    repoInfo = {
      ...repoInfo,
      display: repoInfo?.display || gitContext.repository.displayFallback,
    };
  }

  // Decision promise
  let resolveDecision: (result: {
    approved: boolean;
    feedback: string;
    annotations: unknown[];
    exit?: boolean;
  }) => void;
  const decisionPromise = new Promise<{
    approved: boolean;
    feedback: string;
    annotations: unknown[];
    exit?: boolean;
  }>((resolve) => {
    resolveDecision = resolve;
  });

  // Session-ended stream: announces on /api/session/stream when the parent
  // watcher below detects the Claude Code process that owns this review is
  // gone (see ./parent-watch.ts). Review has no client-lease of its own —
  // this is the only tab-abandonment signal it advertises.
  const sessionStream = createSessionStreamBroadcaster();

  const server = await startBunServerOnAvailablePort((port) =>
    Bun.serve({
        hostname: getServerHostname(),
        port,
        idleTimeout: 0,

        async fetch(req, server) {
          const url = new URL(req.url);

          // API: Get diff content
          if (url.pathname === "/api/diff" && req.method === "GET") {
            maybeRefreshRemoteBaseInfo();
            // Snapshot the served state BEFORE the sidecar await: the startup
            // base upgrade can land mid-await, and reading the globals after
            // it would pair a rebuilt patch with sections computed from the
            // old base — a misgrouped panel. snapshotId travels with the
            // patch it identifies: a mid-await upgrade bumps draftKey, and
            // this client's next freshness probe (echoing the OLD id) raises
            // the Refresh banner for the consistent old snapshot served here.
            const servedPatch = currentPatch;
            const servedBase = currentBase;
            const servedGitRef = currentGitRef;
            const servedError = currentError;
            const servedDiffType = currentDiffType;
            const servedHideWhitespace = currentHideWhitespace;
            const servedSnapshotId = currentSnapshotId();
            const servedGitContext = clientGitContext;
            const sections = await buildSectionsSidecar(servedBase, servedDiffType as string);
            const commitInfo = await buildCommitInfoSidecar(servedDiffType as string);
            const generatedFiles = await buildGeneratedFilesSidecar(servedPatch, servedDiffType as string);
            return Response.json({
              rawPatch: servedPatch,
              gitRef: servedGitRef,
              snapshotId: servedSnapshotId,
              origin,
              mode: isWorkspaceMode ? "workspace" : undefined,
              diffType: hasLocalAccess || isWorkspaceMode ? servedDiffType : undefined,
              // Echo the active base so a page refresh or reconnect rehydrates
              // the picker to what the server is actually using — not the
              // detected default.
              base: hasLocalAccess ? servedBase : undefined,
              hideWhitespace: servedHideWhitespace,
              ...(workspace && { diffOptions: workspace.diffOptions }),
              gitContext: hasLocalAccess ? servedGitContext : undefined,
              approvalNotesSupported,
              repoInfo,
              ...(workspace
                ? { agentCwd: workspace.root }
                : options.agentCwd
                  ? { agentCwd: options.agentCwd }
                  : {}),
              ...(sections && { sections }),
              ...(commitInfo && { commitInfo }),
              ...(generatedFiles && { generatedFiles }),
              ...(baseBehindRemote && { baseBehindRemote: true }),
              ...(servedError && { error: servedError }),
              serverConfig: getServerConfig(gitUser),
            });
          }

          // API: cheap staleness probe — has the underlying VCS state changed
          // since the current diff snapshot was computed? Best-effort: anything
          // that cannot be fingerprinted reports fresh (no banner).
          if (url.pathname === "/api/diff/fresh" && req.method === "GET") {
            const baseline = currentFingerprint;
            // Carry baseBehindRemote on EVERY response — the client sets the flag
            // unconditionally on each probe, so omitting it here clears the
            // "behind GitHub" banner for that poll (a flicker) until the next one.
            const behind = baseBehindRemote ? { baseBehindRemote: true } : {};
            // Per-CLIENT staleness: the client echoes the snapshotId it is
            // rendering; a mismatch means the SERVER's snapshot moved under it
            // (startup base upgrade, a switch from another tab) regardless of
            // what the VCS fingerprint says. This is what lets one server serve
            // multiple tabs holding different snapshots without lying to any
            // of them. The "snapshot:" fingerprint keys the client's dismissal
            // to the server snapshot that made it stale.
            const clientSnapshot = url.searchParams.get("snapshot");
            const serverSnapshot = currentSnapshotId();
            if (clientSnapshot && clientSnapshot !== serverSnapshot) {
              return Response.json({
                fresh: false,
                fingerprint: `snapshot:${serverSnapshot}`,
                ...behind,
              });
            }
            if (baseline == null) return Response.json({ fresh: true, ...behind });
            const probe = await computeDiffFingerprint();
            // A diff switch landing mid-probe replaces the snapshot (and its
            // fingerprint); report fresh and let the next poll compare
            // against the new baseline.
            if (currentFingerprint !== baseline) return Response.json({ fresh: true, ...behind });
            const fresh = probe == null || probe === baseline;
            maybeRefreshRemoteBaseInfo();
            // The probe fingerprint lets the client distinguish "still the
            // same staleness I dismissed" from "ANOTHER change landed since".
            return Response.json({
              fresh,
              ...(fresh ? {} : { fingerprint: probe }),
              ...(baseBehindRemote && { baseBehindRemote: true }),
            });
          }

          // API: fetch the remote default branch so the local baseline catches
          // up with GitHub. Client re-runs /api/diff/switch afterwards.
          if (url.pathname === "/api/fetch-base" && req.method === "POST") {
            if (!remoteBaseCheckApplies()) {
              return Response.json({ error: "Not available in this mode" }, { status: 400 });
            }
            const branchRef =
              remoteDefaultInfo?.branch ??
              (currentBase.startsWith("origin/") ? currentBase : null);
            if (!branchRef) {
              return Response.json({ error: "No remote-tracking base to fetch" }, { status: 400 });
            }
            const branchName = branchRef.replace(/^origin\//, "");
            const result = await gitRuntime.runGit(
              ["fetch", "--end-of-options", "origin", branchName],
              { cwd: gitContext?.cwd, timeoutMs: 30_000 },
            );
            if (result.exitCode !== 0) {
              return Response.json(
                { error: result.stderr.trim() || "git fetch failed" },
                { status: 500 },
              );
            }
            // Re-query the remote (fresh ls-remote) and recompute, rather than
            // trusting a cached tip: a narrow/single-branch fetch refspec can
            // exit 0 without advancing refs/remotes/origin/<branch>, so we must
            // observe the actual post-fetch state. If the ref didn't move, the
            // banner honestly stays instead of silently clearing.
            await refreshRemoteBaseInfo();
            return Response.json({ ok: true, baseBehindRemote });
          }

          // API: Linear commit history for the Commits panel. Git-local
          // sessions only — workspace/jj/p4 don't offer the view (same
          // gate the client's commitsCapable applies). Computed against the
          // same cwd as the active diff so worktree sessions list the
          // worktree's history, and against the active base so the divider
          // matches the review baseline.
          if (url.pathname === "/api/commits" && req.method === "GET") {
            if (!gitContext || workspace || (sessionVcsType && sessionVcsType !== "git")) {
              return Response.json(
                { error: "Commit history is only available for local git reviews" },
                { status: 400 },
              );
            }
            const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
            const before = url.searchParams.get("before") ?? undefined;
            const commitsCwd = resolveVcsCwd(currentDiffType as DiffType, gitContext.cwd);
            const page = await listCommitHistory(gitRuntime, currentBase, commitsCwd, {
              ...(Number.isFinite(limitParam) && { limit: limitParam }),
              ...(before !== undefined && { before }),
            });
            if (!page) {
              return Response.json({ error: "Could not read commit history" }, { status: 500 });
            }
            // Best-effort author avatars from the origin forge (memoized per
            // session; misses just render the initials fallback client-side).
            const avatars = await commitAvatars.resolve(
              commitsCwd,
              page.commits.map((c) => c.authorEmail),
            );
            for (const c of page.commits) {
              const avatarUrl = avatars.get(c.authorEmail);
              if (avatarUrl) c.avatarUrl = avatarUrl;
            }
            return Response.json(page);
          }

          // API: Switch diff type (requires local file access)
          if (url.pathname === "/api/diff/switch" && req.method === "POST") {
            // Capture the ordering token BEFORE any await. Body delivery can
            // finish out of arrival order under network jitter, so capturing the
            // epoch after `await req.json()` let a slow-body OLDER request bump
            // last and overwrite a newer, already-confirmed switch.
            const switchEpoch = ++diffSwitchEpoch;
            if (!hasLocalAccess && !workspace) {
              return Response.json(
                { error: "Not available without local file access" },
                { status: 400 },
              );
            }
            try {
              const body = (await req.json()) as { diffType: DiffType | WorkspaceDiffType; base?: string; hideWhitespace?: boolean; explicitBase?: boolean };
              let newDiffType = body.diffType;

              if (typeof newDiffType !== "string" || !newDiffType) {
                return Response.json(
                  { error: "Missing diffType" },
                  { status: 400 }
                );
              }

              // Don't commit hideWhitespace to shared state yet — a request that
              // ends up superseded must not leave its value behind. Compute the
              // diff with a local, then commit only if we win the epoch check.
              const effectiveHideWhitespace = typeof body.hideWhitespace === "boolean"
                ? body.hideWhitespace
                : currentHideWhitespace;

              if (workspace) {
                const snapshot = await workspace.rebuild({
                  diffType: newDiffType,
                  hideWhitespace: effectiveHideWhitespace,
                });
                if (switchEpoch !== diffSwitchEpoch) {
                  return Response.json({ superseded: true });
                }
                currentHideWhitespace = effectiveHideWhitespace;
                currentPatch = snapshot.rawPatch;
                currentGitRef = snapshot.gitRef;
                currentDiffType = workspace.diffType;
                currentError = snapshot.error;
                draftKey = contentHash(currentPatch);
                captureDiffFingerprint();

                return Response.json({
                  rawPatch: currentPatch,
                  // Snapshot arg: robust against a future await sneaking in
                  // between the epoch check and this response.
                  gitRef: currentGitRef,
                  snapshotId: currentSnapshotId(),
                  approvalNotesSupported,
                  diffType: currentDiffType,
                  diffOptions: workspace.diffOptions,
                  hideWhitespace: currentHideWhitespace,
                  ...(currentError && { error: currentError }),
                });
              }

              if (sessionVcsType && !vcsOwnsDiffType(sessionVcsType, newDiffType as string)) {
                return Response.json(
                  { error: `Diff type is not available in this ${sessionVcsType} session` },
                  { status: 400 },
                );
              }

              // Guard against non-string payloads — resolveBaseBranch calls
              // string methods and would throw a TypeError otherwise. Mirrors
              // Pi's guard so both runtimes validate identically.
              const requestedBase = typeof body.base === "string" ? body.base : undefined;
              // An explicit pick from the base picker is honored verbatim —
              // the local/remote groups are distinct choices, so "main" must
              // not be canonicalized to "origin/main" when the user chose the
              // local ref on purpose. Sticky: later echoes of that choice
              // (diff-type switches, refreshes) must not re-canonicalize it.
              const nextBaseExplicitlyChosen = baseExplicitlyChosen ||
                (body.explicitBase === true && !!requestedBase);
              const base = resolveReviewBase(
                requestedBase,
                nextBaseExplicitlyChosen,
                currentBase,
              );
              const defaultCwd = gitContext?.cwd;

              // Run the new diff
              const result = await runVcsDiff(newDiffType as DiffType, base, defaultCwd, {
                hideWhitespace: effectiveHideWhitespace,
              });
              const resultContext = sessionVcsType === "gitbutler" && result.gitContext?.vcsType === "gitbutler"
                ? result.gitContext
                : undefined;
              const resultBase = resultContext?.defaultBranch ?? base;

              // A newer switch started while we computed — abandon before
              // touching shared state so we never clobber the latest request.
              if (switchEpoch !== diffSwitchEpoch) {
                return Response.json({ superseded: true });
              }

              // Stage every field locally. No shared review state is written
              // until the final epoch guard, so a newer invalid request cannot
              // strand a patch/fingerprint from this request beside the prior
              // GitButler context revision.
              const previousDiffType = currentDiffType;

              // Recompute gitContext for the effective cwd so the client's
              // sidebar (current branch, default branch, diff-mode options)
              // reflects the worktree we're now reviewing — not the main
              // repo's startup state. Best-effort: on failure the client
              // keeps its existing context.
              //
              // Skipped for same-cwd commit:<sha> switches — the commit-rail
              // hot path (three git enumerations dominated click latency; a
              // historical commit's diff can't change any of it). The client
              // keeps its existing context when the field is absent.
              let updatedContext = resultContext;
              let updatedContextRevision = resultContext
                ? getGitButlerContextRevision(resultContext) ?? ""
                : undefined;
              if (!updatedContext && gitContext && !isSameCwdCommitSwitch(previousDiffType as string, newDiffType as string)) {
                try {
                  const effectiveCwd = resolveVcsCwd(newDiffType as DiffType, gitContext.cwd);
                  updatedContext = await getVcsContext(effectiveCwd, sessionVcsType);
                  updatedContextRevision = getGitButlerContextRevision(updatedContext) ?? "";
                } catch {
                  /* best-effort */
                }
              }

              // Base may have changed — re-evaluate behind-ness from the
              // cached remote tip (cheap, local-only).
              // Await (not fire-and-forget) so the switch response carries the
              // freshly-recomputed baseBehindRemote — otherwise the banner lags a
              // poll cycle switching INTO a base-relative mode, or lingers stale
              // switching AWAY from one. Local rev-parse only; cheap.
              const nextBase = updatedContext && sessionVcsType === "gitbutler"
                ? updatedContext.defaultBranch
                : resultBase;
              const nextBaseBehindRemote = await computeBaseBehindRemote(
                nextBase,
                newDiffType as string,
                nextBaseExplicitlyChosen,
              ).catch(() => false);
              const sections = await buildSectionsSidecar(nextBase, newDiffType as string);
              const commitInfo = await buildCommitInfoSidecar(newDiffType as string);
              const generatedFiles = await buildGeneratedFilesSidecar(result.patch, newDiffType as string);
              // Final guard: if a newer switch took over during the trailing
              // awaits, don't emit — the client would misapply our stale body
              // over the newer one (which has its own response inbound).
              if (switchEpoch !== diffSwitchEpoch) {
                return Response.json({ superseded: true });
              }
              currentHideWhitespace = effectiveHideWhitespace;
              currentPatch = result.patch;
              currentGitRef = result.label;
              currentDiffType = newDiffType;
              currentBase = nextBase;
              baseEverSwitched = true;
              baseExplicitlyChosen = nextBaseExplicitlyChosen;
              baseBehindRemote = nextBaseBehindRemote;
              currentError = result.error;
              draftKey = contentHash(currentPatch);
              if (updatedContext && sessionVcsType === "gitbutler") {
                clientGitContext = updatedContext;
                currentContextRevision = updatedContextRevision ?? "";
              }
              captureDiffFingerprint(result.fingerprint);
              return Response.json({
                rawPatch: currentPatch,
                // Snapshot args: robust against a future await sneaking in
                // between the epoch check and this response.
                gitRef: currentGitRef,
                snapshotId: currentSnapshotId(),
                approvalNotesSupported,
                diffType: currentDiffType,
                // Echo the base the server actually used. resolveBaseBranch
                // trusts the caller verbatim; this echo lets the client
                // confirm the request landed (and pick it up when the client
                // didn't supply one and we fell back to detected default).
                base: currentBase,
                hideWhitespace: currentHideWhitespace,
                ...(sections && { sections }),
                ...(commitInfo && { commitInfo }),
                ...(generatedFiles && { generatedFiles }),
                ...(baseBehindRemote && { baseBehindRemote: true }),
                ...(updatedContext && { gitContext: updatedContext }),
                ...(currentError && { error: currentError }),
              });
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Failed to switch diff";
              return Response.json({ error: message }, { status: 500 });
            }
          }



          // API: Get file content for expandable diff context
          if (url.pathname === "/api/file-content" && req.method === "GET") {
            const filePath = url.searchParams.get("path");
            if (!filePath) {
              return Response.json({ error: "Missing path" }, { status: 400 });
            }
            try { validateFilePath(filePath); } catch {
              return Response.json({ error: "Invalid path" }, { status: 400 });
            }
            const oldPath = url.searchParams.get("oldPath") || undefined;
            if (oldPath) {
              try { validateFilePath(oldPath); } catch {
                return Response.json({ error: "Invalid path" }, { status: 400 });
              }
            }

            // File expansion must describe the exact patch the requesting tab
            // rendered. Reject cross-tab switches and mutable VCS changes
            // instead of combining an old patch with newly-resolved contents.
            const requestedSnapshot = url.searchParams.get("snapshot");
            if (requestedSnapshot) {
              if (requestedSnapshot !== currentSnapshotId()) {
                return Response.json({ error: "Diff snapshot is stale; refresh before expanding context" }, { status: 409 });
              }
              const baselineGeneration = fingerprintGeneration;
              let baseline = currentFingerprint;
              const pendingCapture = pendingFingerprintCapture;
              if (baseline == null && pendingCapture) {
                baseline = await pendingCapture;
              }
              if (
                requestedSnapshot !== currentSnapshotId() ||
                baselineGeneration !== fingerprintGeneration
              ) {
                return Response.json({ error: "Diff snapshot is stale; refresh before expanding context" }, { status: 409 });
              }
              if (baseline != null) {
                const probe = await fileContentFingerprintProbes.run(
                  `${requestedSnapshot}:${baselineGeneration}`,
                  computeDiffFingerprint,
                );
                if (
                  requestedSnapshot !== currentSnapshotId() ||
                  currentFingerprint !== baseline ||
                  (probe != null && probe !== baseline)
                ) {
                  return Response.json({ error: "Diff snapshot is stale; refresh before expanding context" }, { status: 409 });
                }
              }
            }

            if (isBinaryPatchFile(currentPatch, filePath)) {
              return Response.json({ oldContent: null, newContent: null });
            }

            if (workspace) {
              try {
                const result = await workspace.getFileContents(filePath, oldPath);
                return Response.json(result);
              } catch (error) {
                return Response.json(
                  { error: error instanceof Error ? error.message : "No file access available" },
                  { status: 400 },
                );
              }
            }

            // Local review: read file contents from local git
            if (hasLocalAccess) {
              const requestedBase = url.searchParams.get("base") ?? undefined;
              const base = resolveReviewBase(requestedBase);
              const defaultCwd = gitContext?.cwd;
              const result = await getVcsFileContentsForDiff(
                currentDiffType as DiffType,
                base,
                filePath,
                oldPath,
                defaultCwd,
              );
              return Response.json(result);
            }

            return Response.json({ error: "No file access available" }, { status: 400 });
          }

          // API: Code navigation (search-based symbol resolution)
          if (url.pathname === "/api/code-nav/resolve" && req.method === "POST") {
            if (isGitButlerCommittedView()) {
              return Response.json(
                { error: "Code navigation is unavailable for committed GitButler views" },
                { status: 400 },
              );
            }
            const hasCodeNavAccess = !!workspace || !!gitContext || !!options.agentCwd;
            if (!hasCodeNavAccess) {
              return Response.json(
                { error: "Code navigation requires local access" },
                { status: 400 },
              );
            }
            const navCwd = await resolveAgentCwdReady();
            if (!navCwd) {
              return Response.json({ error: "Local checkout unavailable" }, { status: 400 });
            }
            const changedFiles = extractChangedFiles(currentPatch);
            return handleCodeNavResolve(req, navCwd, changedFiles);
          }

          // API: Code navigation file preview (read file from working tree)
          if (url.pathname === "/api/code-nav/file" && req.method === "GET") {
            if (isGitButlerCommittedView()) {
              return Response.json(
                { error: "Code navigation is unavailable for committed GitButler views" },
                { status: 400 },
              );
            }
            const hasCodeNavAccess = !!workspace || !!gitContext || !!options.agentCwd;
            if (!hasCodeNavAccess) {
              return Response.json({ error: "Code navigation requires local access" }, { status: 400 });
            }
            const filePath = url.searchParams.get("path");
            if (!filePath) {
              return Response.json({ error: "Missing path" }, { status: 400 });
            }
            try { validateFilePath(filePath); } catch {
              return Response.json({ error: "Invalid path" }, { status: 400 });
            }
            try {
              const navCwd = await resolveAgentCwdReady();
              if (!navCwd) {
                return Response.json({ error: "Local checkout unavailable" }, { status: 400 });
              }
              const content = await Bun.file(`${navCwd}/${filePath}`).text();
              return Response.json({ content });
            } catch {
              return Response.json({ error: "File not found" }, { status: 404 });
            }
          }

          // API: Update user config (write-back to ~/.hypermark/config.json)
          if (url.pathname === "/api/config" && req.method === "POST") {
            try {
              const body = (await req.json()) as { displayName?: string; diffOptions?: Record<string, unknown>; theme?: Record<string, unknown>; favicon?: FaviconStyle };
              const toSave: Record<string, unknown> = {};
              if (body.displayName !== undefined) toSave.displayName = body.displayName;
              if (body.diffOptions !== undefined) toSave.diffOptions = body.diffOptions;
              if (body.theme !== undefined) toSave.theme = body.theme;
              if (isFaviconStyle(body.favicon)) toSave.favicon = body.favicon;
              if (Object.keys(toSave).length > 0) saveConfig(toSave as Parameters<typeof saveConfig>[0]);
              return Response.json({ ok: true });
            } catch {
              return Response.json({ error: "Invalid request" }, { status: 400 });
            }
          }

          // API: Serve images (local paths or temp uploads)
          if (url.pathname === "/api/image") {
            return handleImage(req);
          }

          // API: Upload image -> save to temp -> return path
          if (url.pathname === "/api/upload" && req.method === "POST") {
            return handleUpload(req, sessionUploads);
          }

          // API: Annotation draft persistence
          if (url.pathname === "/api/draft") {
            if (req.method === "POST") return handleDraftSave(req, draftKey);
            if (req.method === "DELETE") return handleDraftDelete(draftKey, req);
            return handleDraftLoad(draftKey);
          }



          // API: Session-ended SSE — see packages/shared/session-stream.ts and
          // ./parent-watch.ts.
          if (url.pathname === SESSION_STREAM_PATH && req.method === "GET") {
            return sessionStream.handleRequest();
          }

          // API: External annotations (SSE-based, for any external tool)
          const externalResponse = await externalAnnotations.handle(req, url, {
            disableIdleTimeout: () => server.timeout(req, 0),
          });
          if (externalResponse) return externalResponse;

          // API: Exit review session without feedback
          if (url.pathname === "/api/exit" && req.method === "POST") {
            // Decision-only line: a dismissal carries no content, and how
            // often reviews are closed without feedback is exactly the
            // behavior data the archive exists to answer.
            archiveReviewSubmission("", [], "dismissed");
            deleteDraft(draftKey, readDraftGenerationFromUrl(req));
            resolveDecision({ approved: false, feedback: "", annotations: [], exit: true });
            return Response.json({ ok: true });
          }

          // API: Submit review feedback
          if (url.pathname === "/api/feedback" && req.method === "POST") {
            try {
              const body = (await req.json()) as {
                approved?: boolean;
                feedback: string;
                annotations: unknown[];
                draftGeneration?: number;
              };

              // Archive BEFORE the draft delete: a failed write keeps the
              // draft as the reviewer's recovery copy (#678 ordering).
              // Defensive on the body's own types: a malformed value must
              // degrade to the legacy behavior (settle + 200), never throw.
              const approved = body.approved ?? false;
              const feedbackValue = body.feedback || "";
              const annotationsValue = body.annotations || [];
              const hasContent =
                (typeof feedbackValue === "string" && feedbackValue.trim().length > 0) ||
                (Array.isArray(annotationsValue) && annotationsValue.length > 0);
              const durable = archiveReviewSubmission(
                feedbackValue,
                annotationsValue,
                approved ? (hasContent ? "approved-with-notes" : "lgtm") : "feedback",
              );
              if (durable) deleteDraft(draftKey, readDraftGenerationFromBody(body));
              resolveDecision({
                approved,
                feedback: feedbackValue,
                annotations: annotationsValue,
              });

              return Response.json({ ok: true });
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Failed to process feedback";
              return Response.json({ error: message }, { status: 500 });
            }
          }



          // Favicon
          if (url.pathname === "/favicon.png") return handleFavicon();

          // API 404 guard: unknown /api/* routes should return JSON, not HTML
          if (url.pathname.startsWith("/api/")) {
            return handleApiNotFound(url.pathname);
          }

          // Serve embedded HTML for all other routes (SPA)
          return new Response(htmlContent, {
            headers: { "Content-Type": "text/html" },
          });
        },

        error(err) {
          console.error("[hypermark] Server error:", err);
          return new Response(
            `Internal Server Error: ${err instanceof Error ? err.message : String(err)}`,
            { status: 500, headers: { "Content-Type": "text/plain" } },
          );
        },
    }),
  );

  const port = server.port!;
  serverUrl = buildAdvertisedUrl(port);

  let parentWatch: ParentWatcher | null = null;

  const stop = () => {
    for (const uploadPath of sessionUploads) {
      try {
        if (existsSync(uploadPath)) unlinkSync(uploadPath);
      } catch {}
    }
    sessionStream.closeSessions();
    parentWatch?.stop();
    server.stop();
    // Invoke cleanup callback (e.g., remove temp worktree)
    if (options.onCleanup) {
      try {
        const result = options.onCleanup();
        if (result instanceof Promise) result.catch(() => {});
      } catch { /* best effort */ }
    }
  };

  // Stale-session reaper: when the Claude Code process that spawned this
  // server is gone, announce on the session stream immediately, then settle
  // the pending decision as dismissed and exit after the grace period.
  if (options.parentWatch) {
    const cfg = options.parentWatch === true ? {} : options.parentWatch;
    parentWatch = startParentWatch({
      parentPid: cfg.parentPid,
      pollIntervalMs: cfg.pollIntervalMs,
      graceMs: cfg.graceMs,
      isAlive: cfg.isAlive,
      onParentGone: () => sessionStream.announceSessionEnded(),
      onGone: () => {
        resolveDecision({ approved: false, feedback: "", annotations: [], exit: true });
        stop();
      },
    });
  }

  // Notify caller that server is ready. An async ready handler that rejects
  // must stop the server and propagate: firing-and-forgetting it would leave
  // an unhandled rejection while the server keeps listening and the session
  // hangs forever.
  if (onReady) {
    try {
      await onReady(serverUrl, port);
    } catch (error) {
      stop();
      throw error;
    }
  }

  return {
    port,
    url: serverUrl,
    waitForDecision: () => decisionPromise,
    stop,
  };
}
