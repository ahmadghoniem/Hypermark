/**
 * Hypermark uninstall lifecycle.
 *
 * The uninstaller removes only product-owned paths and recognizable managed
 * entries from shared host configuration. The default mode keeps local review
 * data. Purge removes the known Hypermark data inventory while preserving
 * unknown top-level entries rather than guessing that custom files are ours.
 */
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
  resolve,
} from "node:path";
import { getHypermarkDataDir } from "@hypermark/shared/data-dir";
import {
  applyEdits,
  createScanner,
  findNodeAtLocation,
  parseTree,
} from "jsonc-parser";

const CORE_SKILLS = [
  "hypermark-review",
  "hypermark-annotate",
  "hypermark-last",
] as const;

// The knowledge-layer CLI reference skill (apps/skills/core/hypermark).
// Installed to the same two scopes as CORE_SKILLS, but kept out of that list:
// it has no legacy slash command, so it must not join LEGACY_COMMAND_NAMES —
// a user's own ~/.claude/commands/hypermark.md would be collateral.
const KNOWLEDGE_SKILLS = [
  "hypermark",
] as const;

const EXTRA_SKILLS = [
  "hypermark-compound",
  "hypermark-setup-goal",
  "hypermark-visual-explainer",
] as const;

// Claude Code command files this product replaced with skills of the same
// name. Every entry is a name Hypermark itself writes: an existing Hypermark
// installation's commands, skills and agent homes are another product's files
// and are left untouched (spec 06, decision D5). Uninstall ownership does not
// widen just because the label on the box changed.
const LEGACY_COMMAND_NAMES = [
  ...CORE_SKILLS,
] as const;

const PURGE_OWNED_TOP_LEVEL = [
  "plans",
  "history",
  "feedback",
  "drafts",
  "active",
  "hooks",
  "compound",
  "sessions",
  "guides",
  "failed-comments",
  "semantic-diff",
  "migrations",
  "config.json",
  "install-prefs",
  "review-skills.json",
] as const;

/**
 * Best-effort WM_SETTINGCHANGE broadcast that runs AFTER the registry write.
 *
 * `[Environment]::SetEnvironmentVariable(..., 'User')` performs this broadcast
 * itself, synchronously, per top-level window and without SMTO_ABORTIFHUNG, so
 * one orphaned or hung GUI process can stall it past the uninstaller's 15 s
 * command timeout and turn a completed PATH edit into a killed PowerShell and
 * exit 124. Here the broadcast is decoupled from the edit: SMTO_ABORTIFHUNG
 * (0x2) skips windows Windows already considers hung, the per-window timeout
 * is short, the whole thing is wrapped in try/catch, and the script exits 0
 * explicitly so nothing about the broadcast can reach the exit code.
 *
 * The DllImport attribute needs double quotes, which the `-Command` one-liners
 * avoid on purpose (the script travels as a single argv element on Windows),
 * so they are assembled from `[char]34` at runtime.
 */
const WINDOWS_PATH_BROADCAST_STATEMENTS = [
  "$q=[char]34",
  "$sig='[DllImport('+$q+'user32.dll'+$q+',CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd,uint msg,UIntPtr wParam,string lParam,uint flags,uint timeout,out UIntPtr result);'",
  "try{Add-Type -Namespace Hypermark -Name PathBroadcast -MemberDefinition $sig; $r=[UIntPtr]::Zero; [void][Hypermark.PathBroadcast]::SendMessageTimeout([IntPtr]0xffff,0x1A,[UIntPtr]::Zero,'Environment',0x2,1000,[ref]$r)}catch{}",
  "exit 0",
] as const;

/**
 * Removes exactly one entry from the HKCU user PATH through the registry API.
 *
 * The value is read unexpanded (`DoNotExpandEnvironmentNames`) and written back
 * with its original kind (REG_EXPAND_SZ on most systems), so `%VARS%` in other
 * entries survive byte for byte. Exit 3 means "not present or unchanged"; on
 * success the ORIGINAL value is echoed as one JSON string on stdout so the
 * caller can roll back. The echo is written before the broadcast, so stdout
 * carrying that JSON proves the registry write completed.
 *
 * @internal Exported only so the PowerShell syntax can be regression-tested.
 */
export const WINDOWS_PATH_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$k=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment',$true)",
  "if($null -eq $k){exit 3}",
  "$p=$k.GetValue('Path',$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)",
  "if($null -eq $p){exit 3}",
  "$p=[string]$p",
  "$kind=$k.GetValueKind('Path')",
  "$t=$env:HYPERMARK_UNINSTALL_PATH.Trim().TrimEnd('\\')",
  "$kept=@($p -split ';' | Where-Object { $_.Trim().TrimEnd('\\') -ine $t })",
  "$n=$kept -join ';'",
  "if($n -eq $p){exit 3}",
  "$k.SetValue('Path',$n,$kind)",
  "$k.Close()",
  "Write-Output (ConvertTo-Json -Compress -InputObject $p)",
  ...WINDOWS_PATH_BROADCAST_STATEMENTS,
].join("; ");

/**
 * Line the restore script prints right after its registry write and before the
 * broadcast, so the caller can tell a completed restore from one that never
 * reached the write even when the process was killed or died afterwards.
 */
const WINDOWS_PATH_RESTORED_SENTINEL = "HYPERMARK_PATH_RESTORED";

/**
 * Writes the echoed original PATH back with the kind the value currently has
 * (the kind the removal preserved), falling back to REG_EXPAND_SZ when the
 * value is gone entirely. Same decoupled broadcast as the removal.
 *
 * @internal Exported only so the PowerShell syntax can be regression-tested.
 */
export const WINDOWS_PATH_RESTORE_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$original=$env:HYPERMARK_UNINSTALL_ORIGINAL_PATH",
  "$k=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment',$true)",
  "if($null -eq $k){$k=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')}",
  "$kind=[Microsoft.Win32.RegistryValueKind]::ExpandString",
  "try{$kind=$k.GetValueKind('Path')}catch{}",
  "$k.SetValue('Path',$original,$kind)",
  "$k.Close()",
  `Write-Output '${WINDOWS_PATH_RESTORED_SENTINEL}'`,
  ...WINDOWS_PATH_BROADCAST_STATEMENTS,
].join("; ");

/** @internal Exported only so the Windows worker syntax can be regression-tested. */
export const WINDOWS_SELF_DELETE_SCRIPT = [
  "$target=$env:HYPERMARK_UNINSTALL_TARGET",
  "for($i=0;$i -lt 40;$i++){",
  "  Start-Sleep -Milliseconds 250",
  "  Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue",
  "  if(-not (Test-Path -LiteralPath $target)){break}",
  "}",
  "$parent=$env:HYPERMARK_UNINSTALL_PARENT",
  "if($parent){Remove-Item -LiteralPath $parent -Force -ErrorAction SilentlyContinue}",
].join("\n");

const WINDOWS_SELF_DELETE_BOOTSTRAP_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$self=(Get-Process -Id $PID).Path",
  "Start-Process -FilePath $self -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$env:HYPERMARK_UNINSTALL_DELETE_SCRIPT) -WindowStyle Hidden",
].join("; ");

type JsonRecord = Record<string, unknown>;

/** Result returned by a host CLI command invoked during uninstall. */
export interface UninstallCommandResult {
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly stdout?: string;
}

/**
 * Platform and process capabilities used by the uninstall application service.
 *
 * Tests provide this boundary explicitly so no test can discover or mutate the
 * developer's real home directory, PATH, plugins, or agent installations.
 */
export interface UninstallEnvironment {
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
  readonly tempDir: string;
  readonly dataDir: string;
  readonly execPath: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly which: (command: string) => string | null;
  readonly runCommand: (
    command: string,
    args: readonly string[],
    env?: Readonly<Record<string, string>>,
  ) => Promise<UninstallCommandResult>;
  readonly scheduleWindowsSelfDelete: (
    target: string,
    parent: string | null,
  ) => Promise<boolean>;
}

/** Requested uninstall behavior after CLI confirmation has completed. */
export interface UninstallRequest {
  readonly purge: boolean;
  readonly dryRun: boolean;
}

/** Caller-visible record of completed, planned, preserved, and failed work. */
export interface UninstallResult {
  readonly ok: boolean;
  readonly dataDir: string;
  readonly removed: readonly string[];
  readonly planned: readonly string[];
  readonly preserved: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

type MutableUninstallResult = {
  dataDir: string;
  removed: string[];
  planned: string[];
  preserved: string[];
  warnings: string[];
  errors: string[];
};

type HookCleanupSpec = {
  readonly event: string;
  readonly matcher?: string;
  readonly suffix: "" | "improve-context";
};

type HookCleanupPolicy = {
  readonly allowRelocatedBinary: boolean;
  readonly removeFileWhenEmpty: boolean;
};

type HostCleanupRecovery = {
  readonly manualCleanup: string;
};

type PathIdentity = {
  readonly device: bigint;
  readonly inode: bigint;
};

type PathIdentityResult =
  | { readonly kind: "found"; readonly identity: PathIdentity }
  | { readonly kind: "missing" }
  | { readonly kind: "error" };

type PathRelation = "same" | "different" | "unknown";

/**
 * Build the real process boundary used by `hypermark uninstall`.
 *
 * No filesystem mutation occurs until `runHypermarkUninstall` is called.
 */
export function createDefaultUninstallEnvironment(): UninstallEnvironment {
  const homeDir = homedir();
  const env = process.env;

  return {
    platform: process.platform,
    homeDir,
    tempDir: tmpdir(),
    dataDir: getHypermarkDataDir(),
    execPath: process.execPath,
    env,
    which: (command) => Bun.which(command),
    runCommand: defaultRunCommand,
    scheduleWindowsSelfDelete: defaultScheduleWindowsSelfDelete,
  };
}

/**
 * Explain the irreversible purge boundary in user-facing language.
 */
export function formatPurgeWarning(dataDir: string): string {
  return [
    `Purge will permanently delete Hypermark data in ${dataDir}.`,
    "This data is local-only. It is not stored on a Hypermark server and cannot be recovered after purge.",
  ].join("\n");
}

/**
 * Remove Hypermark's conventional installation and recognizable host
 * integrations. Expected filesystem and host-CLI failures are collected in
 * the returned value so one stale integration cannot prevent other cleanup.
 */
export async function runHypermarkUninstall(
  request: UninstallRequest,
  environment = createDefaultUninstallEnvironment(),
): Promise<UninstallResult> {
  const state: MutableUninstallResult = {
    dataDir: resolve(environment.dataDir),
    removed: [],
    planned: [],
    preserved: [],
    warnings: [],
    errors: [],
  };

  const initialDataDirIdentity = readPathIdentity(state.dataDir);
  const dataDirSafetyIssue =
    getDataDirSafetyIssue(
      state.dataDir,
      resolve(environment.homeDir),
      resolve(environment.tempDir),
      environment.platform,
    ) ?? inspectDataDir(state.dataDir);

  if (request.purge && dataDirSafetyIssue) {
    return {
      ...state,
      ok: false,
      errors: [
        `Refusing to purge ${state.dataDir}: ${dataDirSafetyIssue}.`,
      ],
    };
  }

  const paths = resolveOwnedPaths(environment);

  await removeHostPlugins(request, environment, paths, state);
  removeHostConfigEntries(request, environment, paths, state);
  removeInstalledFiles(request, environment, paths, state);
  if (dataDirSafetyIssue) {
    state.warnings.push(
      `Preserved managed runtime paths under ${state.dataDir}: ${dataDirSafetyIssue}.`,
    );
  } else {
    const destructiveBoundaryIssue = getDataDirDestructiveBoundaryIssue(
      state.dataDir,
      resolve(environment.homeDir),
      resolve(environment.tempDir),
      environment.platform,
      initialDataDirIdentity,
    );
    if (destructiveBoundaryIssue) {
      state.errors.push(
        `Refusing to remove managed paths under ${state.dataDir}: ${destructiveBoundaryIssue}.`,
      );
    } else {
      // Keep this block synchronous: no host command or other awaited work may
      // reopen a path-swap window after the destructive-boundary revalidation.
      removeInstallerData(request, state);
      if (request.purge) purgeLocalData(request, state);
    }
  }

  if (state.errors.length === 0) {
    await removeBinaries(request, environment, paths, state);
  }
  if (state.errors.length > 0) {
    const hasSpecificRetryWarning = state.warnings.some((warning) =>
      warning.startsWith("The Hypermark CLI remains at "),
    );
    if (!hasSpecificRetryWarning) {
      state.warnings.push(
        "Preserved the Hypermark CLI and its Windows PATH entry so you can resolve the errors and retry uninstall.",
      );
    }
  }

  return {
    ...state,
    ok: state.errors.length === 0,
  };
}

/**
 * Format an uninstall result for terminal output without exposing host command
 * stdout/stderr or unrelated configuration contents.
 */
export function formatUninstallResult(result: UninstallResult): string {
  const lines: string[] = [];

  if (result.removed.length > 0) {
    lines.push("Removed:");
    for (const item of result.removed) lines.push(`  - ${item}`);
  }
  if (result.planned.length > 0) {
    lines.push("Would remove:");
    for (const item of result.planned) lines.push(`  - ${item}`);
  }
  if (result.preserved.length > 0) {
    lines.push("Preserved:");
    for (const item of result.preserved) lines.push(`  - ${item}`);
  }
  if (result.warnings.length > 0) {
    lines.push("Warnings:");
    for (const item of result.warnings) lines.push(`  - ${item}`);
  }
  if (result.errors.length > 0) {
    lines.push("Errors:");
    for (const item of result.errors) lines.push(`  - ${item}`);
  }

  return lines.join("\n");
}

function formatUninstallRetryCommand(request: UninstallRequest): string {
  return request.purge
    ? "hypermark uninstall --purge"
    : "hypermark uninstall";
}

function reportHostCleanupFailure(
  summary: string,
  problem: string,
  recovery: HostCleanupRecovery,
  request: UninstallRequest,
  state: MutableUninstallResult,
): void {
  state.errors.push(
    `${summary}: ${problem}. Manual cleanup: ${recovery.manualCleanup} Then rerun \`${formatUninstallRetryCommand(request)}\`.`,
  );
}

function resolveOwnedPaths(environment: UninstallEnvironment) {
  const { homeDir, env } = environment;
  const claudeDir = env.CLAUDE_CONFIG_DIR || join(homeDir, ".claude");
  const localAppData = env.LOCALAPPDATA || join(homeDir, "AppData", "Local");
  const unixInstallDir = join(homeDir, ".local", "bin");
  const windowsInstallDir = join(localAppData, "hypermark");

  // install.ps1 lands in %LOCALAPPDATA%\hypermark; install.cmd and install.sh
  // land in ~/.local/bin. Both are listed because a machine can carry either.
  const binaryPaths = uniquePaths([
    join(unixInstallDir, "hypermark"),
    join(unixInstallDir, "hypermark.exe"),
    join(windowsInstallDir, "hypermark"),
    join(windowsInstallDir, "hypermark.exe"),
  ]);

  return {
    claudeDir,
    windowsInstallDir,
    binaryPaths,
  };
}

async function removeHostPlugins(
  request: UninstallRequest,
  environment: UninstallEnvironment,
  paths: ReturnType<typeof resolveOwnedPaths>,
  state: MutableUninstallResult,
): Promise<void> {
  // Claude Code is the only host this product installs a plugin into, so it is
  // the only one uninstalled from. Entries for other integrations that
  // this list used to carry were removed in spec 02; a
  // Hypermark uninstall must not reach into hosts it never wrote to.
  const actions = [
    {
      label: "Claude Code plugin hypermark@hypermark",
      command: "claude",
      args: [
        "plugin",
        "uninstall",
        "hypermark@hypermark",
        "--scope",
        "user",
        ...(request.purge ? [] : ["--keep-data"]),
        "--yes",
      ],
      installed:
        hasEnabledPlugin(
          join(paths.claudeDir, "settings.json"),
          "hypermark@hypermark",
        ) ||
        hasInstalledPlugin(
          join(paths.claudeDir, "plugins", "installed_plugins.json"),
          "hypermark@hypermark",
        ),
    },
  ] as const;

  for (const action of actions) {
    if (!action.installed) continue;
    if (request.dryRun) {
      state.planned.push(action.label);
      continue;
    }

    const executable = environment.which(action.command);
    const manualCommand = [action.command, ...action.args].join(" ");
    if (!executable) {
      state.errors.push(
        `${action.label} was detected but ${action.command} is unavailable; it was not removed. Manual cleanup: restore ${action.command} on PATH and run \`${manualCommand}\`. After it succeeds, rerun \`${formatUninstallRetryCommand(request)}\`.`,
      );
      continue;
    }

    const result = await environment.runCommand(executable, action.args);
    if (result.exitCode === 0) {
      state.removed.push(action.label);
    } else {
      state.errors.push(
        `${action.label} was not removed automatically (${result.timedOut ? "command timed out" : `exit ${result.exitCode}`}). Manual cleanup: run \`${manualCommand}\` directly and resolve the host error until it succeeds. Then rerun \`${formatUninstallRetryCommand(request)}\`.`,
      );
    }
  }
}

function removeHostConfigEntries(
  request: UninstallRequest,
  environment: UninstallEnvironment,
  paths: ReturnType<typeof resolveOwnedPaths>,
  state: MutableUninstallResult,
): void {
  cleanupHooksJson(
    join(paths.claudeDir, "settings.json"),
    [
      { event: "PermissionRequest", matcher: "ExitPlanMode", suffix: "" },
      { event: "PreToolUse", matcher: "EnterPlanMode", suffix: "improve-context" },
    ],
    paths.binaryPaths,
    environment.platform,
    {
      allowRelocatedBinary: false,
      removeFileWhenEmpty: false,
    },
    "managed Claude Code hooks",
    `Make ${join(paths.claudeDir, "settings.json")} a readable, writable strict JSON object. Remove only Hypermark command hooks from hooks.PermissionRequest entries whose matcher is "ExitPlanMode" and hooks.PreToolUse entries whose matcher is "EnterPlanMode", then save the file.`,
    request,
    state,
  );

}

function removeInstalledFiles(
  request: UninstallRequest,
  environment: UninstallEnvironment,
  paths: ReturnType<typeof resolveOwnedPaths>,
  state: MutableUninstallResult,
): void {
  for (const skill of [...CORE_SKILLS, ...KNOWLEDGE_SKILLS]) {
    removePath(
      join(paths.claudeDir, "skills", skill),
      request,
      state,
    );
    removePath(
      join(environment.homeDir, ".agents", "skills", skill),
      request,
      state,
    );
  }

  cleanupStaleSkillLayout(
    join(paths.claudeDir, "skills", "core"),
    [...CORE_SKILLS, ...KNOWLEDGE_SKILLS],
    request,
    state,
  );
  cleanupStaleSkillLayout(
    join(paths.claudeDir, "skills", "extra"),
    EXTRA_SKILLS,
    request,
    state,
  );

  // Claude Code command files only. Sweeps for other agent harnesses
  // that used to follow removed files this product never writes; they
  // went with the integrations spec 02 deleted. A machine that also ran
  // Hypermark keeps those files — removing them is that product's uninstall
  // to run, not ours (spec 06, decision D5).
  for (const command of LEGACY_COMMAND_NAMES) {
    removePath(
      join(paths.claudeDir, "commands", `${command}.md`),
      request,
      state,
    );
  }
}

function removeInstallerData(
  request: UninstallRequest,
  state: MutableUninstallResult,
): void {
  // The sidecars are installed components. install-prefs and migrations are
  // retained as local state in the default mode: the migration ledger is what
  // prevents a later reinstall from mistaking separately installed extras for
  // obsolete installer copies. Purge removes those files through its inventory.
  // `sem` and `call-flow` are legacy: the features are gone, but an upgrade
  // from a version that installed them must still clean their directories.
  const sidecarPaths = [
    join(state.dataDir, "vendor", "sem"),
    join(state.dataDir, "vendor", "call-flow"),
  ];
  const hadManagedSidecar = sidecarPaths.some(pathExists);
  for (const path of sidecarPaths) {
    removePath(path, request, state);
  }
  if (hadManagedSidecar) {
    removeEmptyOwnedParent(
      join(state.dataDir, "vendor"),
      ["sem", "call-flow"],
      request,
      state,
    );
  }
}

function purgeLocalData(
  request: UninstallRequest,
  state: MutableUninstallResult,
): void {
  if (!pathExists(state.dataDir)) return;

  for (const name of PURGE_OWNED_TOP_LEVEL) {
    removePath(join(state.dataDir, name), request, state);
  }

  let remaining: string[];
  try {
    remaining = readdirSync(state.dataDir);
  } catch (error) {
    if (existsSync(state.dataDir)) {
      state.errors.push(
        `Could not inspect ${state.dataDir} after purge: ${formatError(error)}`,
      );
    }
    return;
  }

  if (request.dryRun) {
    const recognized = new Set<string>(PURGE_OWNED_TOP_LEVEL);
    const customEntries = remaining.filter(
      (name) =>
        !recognized.has(name) &&
        !(
          name === "vendor" &&
          directoryContainsOnly(
            join(state.dataDir, "vendor"),
            ["sem", "call-flow"],
          )
        ),
    );
    if (customEntries.length === 0) {
      state.planned.push(state.dataDir);
      return;
    }
    for (const name of customEntries) {
      state.preserved.push(
        `${join(state.dataDir, name)} (unrecognized custom entry)`,
      );
    }
    return;
  }

  if (remaining.length === 0) {
    removePath(state.dataDir, request, state);
    return;
  }

  const recognized = new Set<string>(PURGE_OWNED_TOP_LEVEL);
  for (const name of remaining) {
    const remainingPath = join(state.dataDir, name);
    if (recognized.has(name)) {
      state.errors.push(
        `Known Hypermark data entry remains after purge: ${remainingPath}.`,
      );
    } else {
      state.preserved.push(
        `${remainingPath} (unrecognized custom entry)`,
      );
    }
  }
}

async function removeWindowsPathEntry(
  request: UninstallRequest,
  environment: UninstallEnvironment,
  paths: ReturnType<typeof resolveOwnedPaths>,
  state: MutableUninstallResult,
): Promise<string | null> {
  if (environment.platform !== "win32") return null;

  const label = `Windows user PATH entry ${paths.windowsInstallDir}`;
  if (request.dryRun) {
    state.planned.push(label);
    return null;
  }

  const powershell =
    environment.which("powershell.exe") ||
    environment.which("pwsh.exe");
  if (!powershell) {
    state.errors.push(
      `Could not inspect the Windows user PATH; remove ${paths.windowsInstallDir} from PATH manually if present.`,
    );
    return null;
  }

  const result = await environment.runCommand(
    powershell,
    ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_PATH_SCRIPT],
    { HYPERMARK_UNINSTALL_PATH: paths.windowsInstallDir },
  );
  // The script echoes the original PATH only after the registry write
  // succeeded, so a parseable echo proves the edit happened however the
  // process ended afterwards: killed by the timeout while broadcasting, or
  // taken down by a native fault inside Add-Type / SendMessageTimeout that no
  // try/catch can intercept and that exits with an NTSTATUS code.
  const echoedOriginalPath = parseEchoedWindowsPath(result.stdout);
  if (result.exitCode === 0 || echoedOriginalPath !== null) {
    state.removed.push(label);
    if (result.exitCode !== 0) {
      state.warnings.push(
        `Removed ${paths.windowsInstallDir} from the Windows user PATH, but notifying open windows of the change ${result.timedOut ? "timed out" : `failed (exit ${result.exitCode})`}; new terminals pick up the change after you sign in again.`,
      );
    }
    if (echoedOriginalPath !== null) return echoedOriginalPath;
    state.errors.push(
      `Removed ${paths.windowsInstallDir} from the Windows user PATH but could not capture the original PATH for safe rollback.`,
    );
    state.warnings.push(
      `The Hypermark CLI remains at ${environment.execPath}, but its Windows PATH entry was removed without a usable backup. Run that full path to retry, then restore PATH manually if needed.`,
    );
  } else if (result.exitCode !== 3) {
    state.errors.push(
      `Could not remove ${paths.windowsInstallDir} from the Windows user PATH (${result.timedOut ? "command timed out" : `exit ${result.exitCode}`}).`,
    );
  }
  return null;
}

function parseEchoedWindowsPath(stdout: string | undefined): string | null {
  try {
    const originalPath: unknown = JSON.parse(stdout?.trim() ?? "");
    return typeof originalPath === "string" ? originalPath : null;
  } catch {
    return null;
  }
}

async function removeBinaries(
  request: UninstallRequest,
  environment: UninstallEnvironment,
  paths: ReturnType<typeof resolveOwnedPaths>,
  state: MutableUninstallResult,
): Promise<void> {
  const existingBinaryPaths = paths.binaryPaths.filter(pathExists);
  const currentBinary = existingBinaryPaths.find((binaryPath) =>
    pathsReferToSameEntry(
      binaryPath,
      environment.execPath,
      environment.platform,
    ),
  );
  const inactiveBinaries = existingBinaryPaths.filter(
    (binaryPath) => binaryPath !== currentBinary,
  );

  for (const binaryPath of inactiveBinaries) {
    if (request.dryRun) {
      state.planned.push(binaryPath);
      continue;
    }
    removePath(binaryPath, request, state);
    if (state.errors.length > 0) return;
  }

  const originalWindowsPath = await removeWindowsPathEntry(
    request,
    environment,
    paths,
    state,
  );
  if (state.errors.length > 0 || !currentBinary) return;

  if (request.dryRun) {
    state.planned.push(currentBinary);
    return;
  }

  if (environment.platform === "win32") {
    const scheduled = await environment.scheduleWindowsSelfDelete(
      currentBinary,
      pathsReferToSameEntry(
        dirname(currentBinary),
        paths.windowsInstallDir,
        environment.platform,
      )
        ? paths.windowsInstallDir
        : null,
    );
    if (scheduled) {
      state.removed.push(`${currentBinary} (scheduled after exit)`);
    } else {
      state.errors.push(
        `Could not schedule removal of the running executable ${currentBinary}.`,
      );
      if (originalWindowsPath !== null) {
        await restoreWindowsPathEntry(
          environment,
          paths,
          originalWindowsPath,
          state,
        );
      }
    }
    return;
  }

  removePath(currentBinary, request, state);
}

async function restoreWindowsPathEntry(
  environment: UninstallEnvironment,
  paths: ReturnType<typeof resolveOwnedPaths>,
  originalPath: string,
  state: MutableUninstallResult,
): Promise<void> {
  const powershell =
    environment.which("powershell.exe") ||
    environment.which("pwsh.exe");
  if (!powershell) return;

  const result = await environment.runCommand(
    powershell,
    ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_PATH_RESTORE_SCRIPT],
    { HYPERMARK_UNINSTALL_ORIGINAL_PATH: originalPath },
  );
  // Same proof as the removal: the sentinel is printed only after the
  // registry write, so its presence means the restore completed even if the
  // broadcast then timed out or faulted.
  const restored = (result.stdout ?? "")
    .split(/\r?\n/)
    .some((line) => line.trim() === WINDOWS_PATH_RESTORED_SENTINEL);
  if (result.exitCode !== 0 && !restored) {
    state.errors.push(
      `Could not restore ${paths.windowsInstallDir} to the Windows user PATH after self-delete scheduling failed (${result.timedOut ? "command timed out" : `exit ${result.exitCode}`}).`,
    );
    state.warnings.push(
      `The Hypermark CLI remains at ${environment.execPath}, but its Windows PATH entry could not be restored. Run that full path to retry, then restore PATH manually if needed.`,
    );
    return;
  }
  if (result.exitCode !== 0) {
    state.warnings.push(
      `Restored ${paths.windowsInstallDir} to the Windows user PATH, but notifying open windows of the change ${result.timedOut ? "timed out" : `failed (exit ${result.exitCode})`}; new terminals pick up the change after you sign in again.`,
    );
  }

  const label = `Windows user PATH entry ${paths.windowsInstallDir}`;
  const removedIndex = state.removed.indexOf(label);
  if (removedIndex >= 0) state.removed.splice(removedIndex, 1);
  state.preserved.push(`${label} (restored for retry)`);
}

function cleanupHooksJson(
  filePath: string,
  specs: readonly HookCleanupSpec[],
  binaryPaths: readonly string[],
  platform: NodeJS.Platform,
  policy: HookCleanupPolicy,
  label: string,
  manualCleanup: string,
  request: UninstallRequest,
  state: MutableUninstallResult,
): void {
  const recovery = { manualCleanup };
  const parsed = readJsonRecord(
    filePath,
    label,
    recovery,
    request,
    state,
  );
  if (!parsed) return;

  const hooks = asRecord(parsed.hooks);
  if (!hooks) return;

  let changed = false;
  for (const spec of specs) {
    const entries = hooks[spec.event];
    if (!Array.isArray(entries)) continue;

    const nextEntries: unknown[] = [];
    let eventChanged = false;
    for (const value of entries) {
      const entry = asRecord(value);
      if (
        !entry ||
        (spec.matcher !== undefined && entry.matcher !== spec.matcher)
      ) {
        nextEntries.push(value);
        continue;
      }

      const hookEntries = entry.hooks;
      if (!Array.isArray(hookEntries)) {
        nextEntries.push(value);
        continue;
      }

      const nextHooks = hookEntries.filter(
        (hook) =>
          !isManagedHook(
            hook,
            binaryPaths,
            spec.suffix,
            platform,
            policy.allowRelocatedBinary,
          ),
      );
      if (nextHooks.length === hookEntries.length) {
        nextEntries.push(value);
        continue;
      }

      changed = true;
      eventChanged = true;
      if (nextHooks.length === 0 && hasOnlyKeys(entry, ["matcher", "hooks"])) {
        continue;
      }
      nextEntries.push({ ...entry, hooks: nextHooks });
    }

    if (!eventChanged) continue;
    if (nextEntries.length === 0) delete hooks[spec.event];
    else hooks[spec.event] = nextEntries;
  }

  if (!changed) return;
  if (Object.keys(hooks).length === 0) delete parsed.hooks;
  else parsed.hooks = hooks;

  if (request.dryRun) {
    state.planned.push(`${label} in ${filePath}`);
    return;
  }

  if (policy.removeFileWhenEmpty && Object.keys(parsed).length === 0) {
    removePath(filePath, request, state, recovery);
    return;
  }

  writeJson(filePath, parsed, label, recovery, request, state);
}

function removeJsoncArrayEntry(
  content: string,
  path: (string | number)[],
  index: number,
): string {
  const tree = parseTree(content, [], {
    allowTrailingComma: true,
    disallowComments: false,
  });
  const arrayNode = tree ? findNodeAtLocation(tree, path) : undefined;
  const children = arrayNode?.type === "array" ? arrayNode.children : undefined;
  const target = children?.[index];
  if (!arrayNode || !children || !target) return content;

  const targetEnd = target.offset + target.length;
  const next = children[index + 1];
  let commaOffset = findJsoncCommaOffset(
    content,
    targetEnd,
    next?.offset ?? arrayNode.offset + arrayNode.length,
  );
  if (commaOffset === null && index > 0) {
    const previous = children[index - 1];
    if (previous) {
      commaOffset = findJsoncCommaOffset(
        content,
        previous.offset + previous.length,
        target.offset,
      );
    }
  }

  const edits = [
    { offset: target.offset, length: target.length, content: "" },
  ];
  if (commaOffset !== null) {
    edits.push({ offset: commaOffset, length: 1, content: "" });
  }
  return applyEdits(content, edits);
}

function findJsoncCommaOffset(
  content: string,
  start: number,
  end: number,
): number | null {
  const segment = content.slice(start, end);
  const scanner = createScanner(segment, false);
  while (scanner.getPosition() < segment.length) {
    scanner.scan();
    if (
      scanner.getTokenLength() === 1 &&
      segment[scanner.getTokenOffset()] === ","
    ) {
      return start + scanner.getTokenOffset();
    }
  }
  return null;
}

function readJsonRecord(
  filePath: string,
  integration: string,
  recovery: HostCleanupRecovery,
  request: UninstallRequest,
  state: MutableUninstallResult,
): JsonRecord | null {
  if (!existsSync(filePath)) return null;
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (error) {
    reportHostCleanupFailure(
      `Could not inspect ${filePath}`,
      formatError(error),
      recovery,
      request,
      state,
    );
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(content);
    const record = asRecord(parsed);
    if (!record) {
      reportMalformedSharedConfig(
        filePath,
        "it is not a JSON object",
        integration,
        recovery,
        request,
        state,
      );
      return null;
    }
    return record;
  } catch {
    reportMalformedSharedConfig(
      filePath,
      "it is not strict JSON",
      integration,
      recovery,
      request,
      state,
    );
    return null;
  }
}

function reportMalformedSharedConfig(
  filePath: string,
  reason: string,
  integration: string,
  recovery: HostCleanupRecovery,
  request: UninstallRequest,
  state: MutableUninstallResult,
): void {
  reportHostCleanupFailure(
    `Preserved ${filePath}`,
    `${reason}, so ${integration} cannot be classified safely`,
    recovery,
    request,
    state,
  );
}

function writeJson(
  filePath: string,
  value: JsonRecord,
  label: string,
  recovery: HostCleanupRecovery,
  request: UninstallRequest,
  state: MutableUninstallResult,
): void {
  try {
    const original = readFileSync(filePath, "utf8");
    const lineEnding = original.includes("\r\n") ? "\r\n" : "\n";
    const indentation = original.match(/\r?\n([\t ]+)\S/)?.[1];
    const trailingNewline = /\r?\n$/.test(original);
    const serialized = JSON.stringify(value, null, indentation)
      .replace(/\n/g, lineEnding);
    writeFileSync(
      filePath,
      `${serialized}${trailingNewline ? lineEnding : ""}`,
      "utf8",
    );
    state.removed.push(`${label} in ${filePath}`);
  } catch (error) {
    reportHostCleanupFailure(
      `Could not update ${filePath}`,
      formatError(error),
      recovery,
      request,
      state,
    );
  }
}

function writeTextUpdate(
  filePath: string,
  content: string,
  label: string,
  recovery: HostCleanupRecovery,
  request: UninstallRequest,
  state: MutableUninstallResult,
): void {
  try {
    writeFileSync(filePath, content, "utf8");
    state.removed.push(`${label} in ${filePath}`);
  } catch (error) {
    reportHostCleanupFailure(
      `Could not update ${filePath}`,
      formatError(error),
      recovery,
      request,
      state,
    );
  }
}

function cleanupStaleSkillLayout(
  directory: string,
  managedSkills: readonly string[],
  request: UninstallRequest,
  state: MutableUninstallResult,
): void {
  let entries: string[];
  try {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      state.preserved.push(`${directory} (custom or unrecognized skill layout)`);
      return;
    }
    entries = readdirSync(directory);
  } catch (error) {
    if (isMissingPathError(error)) return;
    state.errors.push(`Could not inspect ${directory}: ${formatError(error)}`);
    return;
  }

  const managed = new Set(managedSkills);
  const managedEntries = entries.filter((entry) => managed.has(entry));
  if (managedEntries.length === 0) return;

  for (const entry of managedEntries) {
    removePath(join(directory, entry), request, state);
  }

  const customEntries = entries.filter((entry) => !managed.has(entry));
  for (const entry of customEntries) {
    state.preserved.push(
      `${join(directory, entry)} (custom or unrecognized skill layout entry)`,
    );
  }

  if (customEntries.length === 0) {
    removeEmptyOwnedParent(directory, managedSkills, request, state);
  }
}

function directoryContainsOnly(
  directory: string,
  allowedEntries: readonly string[],
): boolean {
  try {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    const allowed = new Set(allowedEntries);
    const entries = readdirSync(directory);
    return (
      entries.length > 0 &&
      entries.every((entry) => allowed.has(entry))
    );
  } catch {
    return false;
  }
}

function removeEmptyOwnedParent(
  directory: string,
  plannedChildren: readonly string[],
  request: UninstallRequest,
  state: MutableUninstallResult,
): void {
  let entries: string[];
  try {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return;
    entries = readdirSync(directory);
  } catch (error) {
    if (isMissingPathError(error)) return;
    state.errors.push(`Could not inspect ${directory}: ${formatError(error)}`);
    return;
  }

  if (request.dryRun) {
    const planned = new Set(plannedChildren);
    if (!entries.every((entry) => planned.has(entry))) return;
  } else if (entries.length > 0) {
    return;
  }
  removePath(directory, request, state);
}

function removePath(
  path: string,
  request: UninstallRequest,
  state: MutableUninstallResult,
  recovery?: HostCleanupRecovery,
): void {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (isMissingPathError(error)) return;
    if (recovery) {
      reportHostCleanupFailure(
        `Could not inspect ${path}`,
        formatError(error),
        recovery,
        request,
        state,
      );
    } else {
      state.errors.push(`Could not inspect ${path}: ${formatError(error)}`);
    }
    return;
  }

  if (request.dryRun) {
    state.planned.push(path);
    return;
  }

  try {
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      rmSync(path, { recursive: true, force: true });
    } else {
      // Never route a symlink through recursive removal. Unlinking the directory
      // entry also gives hardlinked files the intended target-preserving behavior.
      unlinkSync(path);
    }
    state.removed.push(path);
  } catch (error) {
    if (recovery) {
      reportHostCleanupFailure(
        `Could not remove ${path}`,
        formatError(error),
        recovery,
        request,
        state,
      );
    } else {
      state.errors.push(`Could not remove ${path}: ${formatError(error)}`);
    }
  }
}

function isManagedHook(
  value: unknown,
  binaryPaths: readonly string[],
  suffix: "" | "improve-context",
  platform: NodeJS.Platform,
  allowRelocatedBinary = false,
): boolean {
  const hook = asRecord(value);
  if (!hook || hook.type !== "command" || typeof hook.command !== "string") {
    return false;
  }

  const command = hook.command.trim();
  const expectedBare = suffix ? `hypermark ${suffix}` : "hypermark";
  if (command === expectedBare) return true;

  for (const binaryPath of binaryPaths) {
    const candidates = suffix
      ? [`${binaryPath} ${suffix}`, `"${binaryPath}" ${suffix}`]
      : [binaryPath, `"${binaryPath}"`];
    if (candidates.some((candidate) => sameCommand(command, candidate, platform))) {
      return true;
    }
  }
  return allowRelocatedBinary && isRelocatedHypermarkCommand(command, suffix);
}

function isRelocatedHypermarkCommand(
  command: string,
  suffix: "" | "improve-context",
): boolean {
  const commandSuffix = suffix ? ` ${suffix}` : "";
  if (commandSuffix && !command.endsWith(commandSuffix)) return false;

  const executable = commandSuffix
    ? command.slice(0, -commandSuffix.length).trim()
    : command;
  const unquoted =
    executable.length >= 2 &&
      executable.startsWith('"') &&
      executable.endsWith('"')
      ? executable.slice(1, -1)
      : executable;
  if (!isAbsolute(unquoted)) return false;

  const executableName = basename(unquoted).toLowerCase();
  return executableName === "hypermark" || executableName === "hypermark.exe";
}

function hasEnabledPlugin(filePath: string, pluginId: string): boolean {
  const parsed = tryReadJsonRecord(filePath);
  const enabled = parsed ? asRecord(parsed.enabledPlugins) : null;
  return enabled?.[pluginId] === true;
}

function hasInstalledPlugin(filePath: string, pluginId: string): boolean {
  const parsed = tryReadJsonRecord(filePath);
  const plugins = parsed ? asRecord(parsed.plugins) : null;
  const installs = plugins?.[pluginId];
  return Array.isArray(installs) && installs.length > 0;
}

function tryReadJsonRecord(filePath: string): JsonRecord | null {
  if (!existsSync(filePath)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function hasOnlyKeys(
  value: JsonRecord,
  allowed: readonly string[],
): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function sameCommand(
  left: string,
  right: string,
  platform: NodeJS.Platform,
): boolean {
  const normalizedLeft = left.replace(/\\/g, "/");
  const normalizedRight = right.replace(/\\/g, "/");
  return platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function sameLexicalPath(
  left: string,
  right: string,
  platform: NodeJS.Platform,
): boolean {
  const normalizedLeft = normalize(resolve(left));
  const normalizedRight = normalize(resolve(right));
  return platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function pathsReferToSameEntry(
  left: string,
  right: string,
  platform: NodeJS.Platform,
): boolean {
  return comparePathEntries(left, right, platform) === "same";
}

function comparePathEntries(
  left: string,
  right: string,
  platform: NodeJS.Platform,
): PathRelation {
  // The lexical check is the conservative fallback for missing paths and also
  // preserves Windows path semantics in cross-platform tests. Existing aliases
  // are compared by filesystem identity so case, links, and mounts cannot hide
  // that two spellings refer to the same entry.
  if (sameLexicalPath(left, right, platform)) return "same";

  const leftIdentity = readPathIdentity(left);
  const rightIdentity = readPathIdentity(right);
  if (leftIdentity.kind === "error" || rightIdentity.kind === "error") {
    return "unknown";
  }
  if (leftIdentity.kind !== "found" || rightIdentity.kind !== "found") {
    return "different";
  }
  return sameIdentity(leftIdentity.identity, rightIdentity.identity)
    ? "same"
    : "different";
}

function readPathIdentity(path: string): PathIdentityResult {
  try {
    const stat = statSync(path, { bigint: true });
    return {
      kind: "found",
      identity: { device: stat.dev, inode: stat.ino },
    };
  } catch (error) {
    if (isMissingPathError(error)) return { kind: "missing" };
    return { kind: "error" };
  }
}

function sameIdentity(left: PathIdentity, right: PathIdentity): boolean {
  return left.device === right.device && left.inode === right.inode;
}

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths.map((path) => normalize(resolve(path))))];
}

function getDataDirSafetyIssue(
  dataDir: string,
  homeDir: string,
  tempDir: string,
  platform: NodeJS.Platform,
): string | null {
  if (!isAbsolute(dataDir)) {
    return "the data directory is not absolute";
  }
  const root = parse(dataDir).root;
  const rootRelation = comparePathEntries(dataDir, root, platform);
  if (rootRelation === "same") {
    return "the data directory is a filesystem root";
  }
  if (rootRelation === "unknown") {
    return "the data directory identity relative to the filesystem root could not be verified";
  }

  const homeRelation = comparePathEntries(dataDir, homeDir, platform);
  if (homeRelation === "same") {
    return "the data directory is the home directory; choose a dedicated HYPERMARK_DATA_DIR";
  }
  if (homeRelation === "unknown") {
    return "the data directory identity relative to the home directory could not be verified";
  }

  const ancestorRelation = compareAncestorRelation(
    dataDir,
    homeDir,
    platform,
  );
  if (ancestorRelation === "same") {
    return `the data directory contains the home directory ${homeDir}`;
  }
  if (ancestorRelation === "unknown") {
    return "whether the data directory contains the home directory could not be verified";
  }

  const tempRelation = comparePathEntries(dataDir, tempDir, platform);
  if (tempRelation === "same") {
    return "the data directory is the shared temporary directory";
  }
  if (tempRelation === "unknown") {
    return "the data directory identity relative to the shared temporary directory could not be verified";
  }
  return null;
}

function getDataDirDestructiveBoundaryIssue(
  dataDir: string,
  homeDir: string,
  tempDir: string,
  platform: NodeJS.Platform,
  initialIdentity: PathIdentityResult,
): string | null {
  const currentSafetyIssue =
    getDataDirSafetyIssue(dataDir, homeDir, tempDir, platform) ??
    inspectDataDir(dataDir);
  if (currentSafetyIssue) {
    return `the data directory changed after initial validation (${currentSafetyIssue})`;
  }

  const currentIdentity = readPathIdentity(dataDir);
  if (
    initialIdentity.kind === "error" ||
    currentIdentity.kind === "error"
  ) {
    return "the data directory identity could not be revalidated after host cleanup";
  }
  if (initialIdentity.kind !== currentIdentity.kind) {
    return "the data directory changed after initial validation";
  }
  if (
    initialIdentity.kind === "found" &&
    currentIdentity.kind === "found" &&
    !sameIdentity(initialIdentity.identity, currentIdentity.identity)
  ) {
    return "the data directory changed after initial validation";
  }
  return null;
}

function inspectDataDir(dataDir: string): string | null {
  try {
    const stat = lstatSync(dataDir);
    if (stat.isSymbolicLink()) {
      return "the data directory is a symlink; set HYPERMARK_DATA_DIR to its resolved target and retry";
    }
    if (!stat.isDirectory()) {
      return "the data path is not a directory";
    }
  } catch (error) {
    if (isMissingPathError(error)) return null;
    return `the data directory could not be inspected (${formatError(error)})`;
  }
  return null;
}

function compareAncestorRelation(
  parent: string,
  child: string,
  platform: NodeJS.Platform,
): PathRelation {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);
  const rel = platform === "win32"
    ? relative(resolvedParent.toLowerCase(), resolvedChild.toLowerCase())
    : relative(resolvedParent, resolvedChild);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return "same";
  }

  const parentIdentity = readPathIdentity(resolvedParent);
  if (parentIdentity.kind === "error") return "unknown";
  if (parentIdentity.kind === "missing") return "different";

  // A string-relative check cannot recognize a case alias, bind mount, or
  // symlinked parent. Walk the existing child's ancestors and compare their
  // device/inode pairs with the proposed purge root instead.
  let current = resolvedChild;
  while (true) {
    const currentIdentity = readPathIdentity(current);
    if (currentIdentity.kind === "error") return "unknown";
    if (
      currentIdentity.kind === "found" &&
      sameIdentity(parentIdentity.identity, currentIdentity.identity)
    ) {
      return "same";
    }

    const next = dirname(current);
    if (next === current) return "different";
    current = next;
  }
}

async function defaultRunCommand(
  command: string,
  args: readonly string[],
  env?: Readonly<Record<string, string>>,
): Promise<UninstallCommandResult> {
  let proc: Bun.Subprocess<"ignore", "pipe", "ignore">;
  try {
    proc = Bun.spawn([command, ...args], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      env: { ...process.env, ...env },
    });
  } catch {
    return { exitCode: 1, timedOut: false };
  }

  const stdoutPromise = new Response(proc.stdout).text().catch(() => "");

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<number>((resolveTimeout) => {
    timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
      resolveTimeout(124);
    }, 15_000);
  });
  const exitCode = await Promise.race([proc.exited, timeout]);
  if (timer) clearTimeout(timer);
  return { exitCode, timedOut, stdout: await stdoutPromise };
}

async function defaultScheduleWindowsSelfDelete(
  target: string,
  parent: string | null,
): Promise<boolean> {
  const powershell = Bun.which("powershell.exe") || Bun.which("pwsh.exe");
  if (!powershell) return false;

  try {
    const proc = Bun.spawn(
      [
        powershell,
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        WINDOWS_SELF_DELETE_BOOTSTRAP_SCRIPT,
      ],
      {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        env: {
          ...process.env,
          HYPERMARK_UNINSTALL_TARGET: target,
          HYPERMARK_UNINSTALL_PARENT: parent ?? "",
          HYPERMARK_UNINSTALL_DELETE_SCRIPT: Buffer.from(
            WINDOWS_SELF_DELETE_SCRIPT,
            "utf16le",
          ).toString("base64"),
        },
      },
    );
    return await proc.exited === 0;
  } catch {
    return false;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    return !isMissingPathError(error);
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}
