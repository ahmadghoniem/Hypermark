/**
 * Session Registry
 *
 * Tracks active Hypermark server sessions in ~/.hypermark/sessions/
 * so users can discover and reopen closed browser tabs.
 */

import { join } from "path";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  existsSync,
} from "fs";
import { getHypermarkDataDir } from "@hypermark/shared/data-dir";

export interface SessionInfo {
  pid: number;
  port: number;
  url: string;
  mode: "plan" | "review" | "annotate" | "goal-setup";
  project: string;
  startedAt: string;
  label: string;
}

function getSessionsDir(): string {
  const dir = join(getHypermarkDataDir(), "sessions");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionPath(pid: number): string {
  return join(getSessionsDir(), `${pid}.json`);
}

/**
 * Check if a process is still alive.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Register the current server session. Best-effort: the registry only powers
 * `hypermark sessions` discovery, so an unwritable data dir (read-only
 * mount, disk full) must never take the server down with it.
 */
export function registerSession(info: SessionInfo): void {
  try {
    writeFileSync(sessionPath(info.pid), JSON.stringify(info, null, 2), "utf-8");
  } catch {
    // Session discovery is unavailable; the session itself is unaffected.
  }
}

/**
 * Unregister the current process's session. No-op if not found.
 */
export function unregisterSession(pid: number = process.pid): void {
  try {
    const filePath = sessionPath(pid);
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Ignore delete failures (including an unwritable sessions dir).
  }
}

/**
 * Terminate a session's process and remove its registry entry.
 *
 * `process.kill(pid, 'SIGTERM')` works on Unix as a normal signal the target
 * can (but does not, here) intercept. On Windows, Bun's `process.kill` sends
 * a terminate the target cannot intercept, so its own `process.on('exit')`
 * cleanup may not run — the registry entry is removed here, from the killer
 * side, rather than relying on the victim to unregister itself.
 *
 * Returns false when the process was already gone (the registry entry is
 * still removed either way — a dead PID has no business staying listed).
 */
export function killSession(pid: number): boolean {
  let killed = false;
  // On Windows a terminated server can't dispose its agent-terminal sidecar,
  // so kill the whole tree the way agent-terminal.ts does.
  if (process.platform === "win32") {
    try {
      const result = Bun.spawnSync(["taskkill", "/T", "/F", "/PID", String(pid)], {
        stdin: "ignore", stdout: "ignore", stderr: "ignore", windowsHide: true,
      });
      if (result.exitCode === 0) {
        unregisterSession(pid);
        return true;
      }
    } catch {}
  }
  try {
    process.kill(pid, "SIGTERM");
    killed = true;
  } catch {
    killed = false;
  }
  unregisterSession(pid);
  return killed;
}

/**
 * List all active sessions. Automatically removes stale entries.
 */
export function listSessions(): SessionInfo[] {
  const active: SessionInfo[] = [];

  let entries: string[];
  let dir: string;
  try {
    dir = getSessionsDir();
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;

    const filePath = join(dir, entry);
    try {
      const data: SessionInfo = JSON.parse(readFileSync(filePath, "utf-8"));

      if (isAlive(data.pid)) {
        active.push(data);
      } else {
        // Stale session — clean up
        try {
          unlinkSync(filePath);
        } catch {}
      }
    } catch {
      // Corrupt file — remove it
      try {
        unlinkSync(filePath);
      } catch {}
    }
  }

  // Sort by most recent first
  return active.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}
