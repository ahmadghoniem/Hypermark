/**
 * Parent Process Watcher (Stale-session reaper)
 *
 * Polls the PID of the Claude Code process (or parent shell) that spawned
 * the server. When that process exits, announces on the session stream,
 * waits a 10s grace period for client drafts to flush, and settles the
 * pending server decision as dismissed.
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { spawnSync } from "child_process";

/**
 * Check if a process PID is currently alive.
 * process.kill(pid, 0) checks for existence on Unix and Windows in Node/Bun.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse `ps -eo pid=,ppid=` output into a pid -> ppid map.
 */
export function parseProcessTablePs(stdout: string): Map<number, number> {
  const table = new Map<number, number>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const pid = parseInt(parts[0], 10);
    const ppid = parseInt(parts[1], 10);
    if (Number.isFinite(pid) && Number.isFinite(ppid)) {
      table.set(pid, ppid);
    }
  }
  return table;
}

/**
 * Parse PowerShell `Get-CimInstance Win32_Process | ConvertTo-Csv` output into a pid -> ppid map.
 */
export function parseProcessTableCsv(stdout: string): Map<number, number> {
  const table = new Map<number, number>();
  const lines = stdout.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const match = lines[i].trim().match(/^"?(\d+)"?\s*,\s*"?(\d+)"?$/);
    if (!match) continue;
    const pid = parseInt(match[1], 10);
    const ppid = parseInt(match[2], 10);
    if (Number.isFinite(pid) && Number.isFinite(ppid)) {
      table.set(pid, ppid);
    }
  }
  return table;
}

/**
 * Snapshot the entire process table in a single spawn, platform-aware.
 */
export function snapshotProcessTable(): Map<number, number> {
  try {
    if (process.platform === "win32") {
      const result = spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Csv -NoTypeInformation",
        ],
        { encoding: "utf-8", timeout: 2000 }
      );
      if (result.status !== 0) return new Map();
      return parseProcessTableCsv(result.stdout);
    }
    const result = spawnSync("ps", ["-eo", "pid=,ppid="], {
      encoding: "utf-8",
      timeout: 2000,
    });
    if (result.status !== 0) return new Map();
    return parseProcessTablePs(result.stdout);
  } catch {
    return new Map();
  }
}

/**
 * Default `getParentPid` implementation. Snapshots process table once lazily.
 */
export function createDefaultGetParentPid(): (pid: number) => number | null {
  let table: Map<number, number> | null = null;
  return (pid: number) => {
    if (table === null) table = snapshotProcessTable();
    const ppid = table.get(pid);
    return ppid && ppid > 0 ? ppid : null;
  };
}

/**
 * Find the parent Claude Code PID by walking ancestors and looking for
 * ~/.claude/sessions/<pid>.json. Falls back to startPid (or process.ppid).
 */
export function findParentPid(opts: {
  startPid?: number;
  sessionsDir?: string;
  getParentPid?: (pid: number) => number | null;
  maxHops?: number;
} = {}): number {
  const startPid = opts.startPid ?? process.ppid;
  if (!startPid || startPid <= 1) return startPid;

  const sessionsDir = opts.sessionsDir ?? join(homedir(), ".claude", "sessions");
  const getParent = opts.getParentPid ?? createDefaultGetParentPid();
  const maxHops = opts.maxHops ?? 8;

  let current: number | null = startPid;
  let hops = 0;
  const seen = new Set<number>();

  while (hops < maxHops && current !== null && current > 1 && !seen.has(current)) {
    seen.add(current);
    try {
      if (existsSync(join(sessionsDir, `${current}.json`))) {
        return current;
      }
    } catch {}
    current = getParent(current);
    hops++;
  }

  return startPid;
}

export interface ParentWatchOptions {
  parentPid?: number;
  pollIntervalMs?: number;
  graceMs?: number;
  isAlive?: (pid: number) => boolean;
  onParentGone?: () => void;
  onGone: () => void;
}

export interface ParentWatcher {
  parentPid: number;
  stop: () => void;
}

/**
 * Start watching the parent process.
 * When the parent is gone:
 * 1. Calls onParentGone() immediately (to announce sessionEnded on the stream).
 * 2. Waits graceMs (default 10s).
 * 3. Calls onGone() to settle dismissed and stop the server.
 */
export function startParentWatch(options: ParentWatchOptions): ParentWatcher {
  const parentPid = options.parentPid ?? findParentPid();
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  const graceMs = options.graceMs ?? 10_000;
  const isAlive = options.isAlive ?? isProcessAlive;

  let stopped = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  let parentGone = false;

  const stop = () => {
    stopped = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (graceTimer) {
      clearTimeout(graceTimer);
      graceTimer = null;
    }
  };

  if (!parentPid || parentPid <= 1) {
    return { parentPid, stop };
  }

  pollTimer = setInterval(() => {
    if (stopped || parentGone) return;
    if (!isAlive(parentPid)) {
      parentGone = true;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      try {
        options.onParentGone?.();
      } catch (err) {
        console.error("[parent-watch] onParentGone error:", err);
      }

      if (graceMs <= 0) {
        if (!stopped) {
          try {
            options.onGone();
          } catch (err) {
            console.error("[parent-watch] onGone error:", err);
          }
        }
      } else {
        graceTimer = setTimeout(() => {
          graceTimer = null;
          if (!stopped) {
            try {
              options.onGone();
            } catch (err) {
              console.error("[parent-watch] onGone error:", err);
            }
          }
        }, graceMs);
      }
    }
  }, pollIntervalMs);

  return { parentPid, stop };
}
