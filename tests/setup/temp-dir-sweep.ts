/**
 * Give every test process its own temp root, and delete it on the way out.
 *
 * Dozens of test files call `mkdtempSync(join(tmpdir(), "hypermark-…"))` and
 * never remove the directory. On disk that is nothing -- a full run leaves
 * roughly 350 directories totalling under 2 MB -- but on Windows each one is an
 * NTFS directory that Defender, the search indexer, Disk Cleanup and every
 * later `%TEMP%` enumeration has to walk, and they accumulate across runs.
 *
 * Rather than edit every call site (and re-break it on the next new test), this
 * points `os.tmpdir()` at a per-process sandbox. `mkdtemp` then lands inside it,
 * child processes inherit it through the environment, and one `rmSync` at exit
 * takes the whole run's litter with it. Attribution is exact, so a Hypermark
 * server running on the same machine during a test run is never touched.
 *
 * Bun makes `node:fs` exports read-only, so wrapping `mkdtempSync` directly is
 * not an option; redirecting the root is.
 */
import { chmodSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Short segment: Windows still enforces MAX_PATH for many APIs, and fixtures
// nest several directories deeper than this.
const systemTemp = tmpdir();
const root = join(systemTemp, `hm-t-${process.pid}`);
mkdirSync(root, { recursive: true });

// os.tmpdir() reads TMPDIR on POSIX and TEMP/TMP on Windows. Set all three so
// the redirect holds on either platform and is inherited by spawned processes.
process.env.TMPDIR = root;
process.env.TEMP = root;
process.env.TMP = root;

/**
 * Several fixtures make a directory read-only on purpose (the "unwritable"
 * cases). On Windows that makes `rmSync` fail outright rather than fall back,
 * so restore write permission on the way down before retrying.
 */
function makeWritable(path: string): void {
  try {
    chmodSync(path, 0o700);
    if (!statSync(path).isDirectory()) return;
    for (const entry of readdirSync(path)) makeWritable(join(path, entry));
  } catch {
    // Already gone, or not ours to change; the retry below will report it.
  }
}

let swept = false;
function sweep(): void {
  if (swept) return;
  swept = true;
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    return;
  } catch {
    // Fall through to the permission repair.
  }
  try {
    makeWritable(root);
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // A file still held open by a lingering child is not worth failing a run
    // over; the next run's sweep, or %TEMP% cleanup, will collect it.
  }
}

/**
 * Collect roots left by earlier runs. The exit sweep below is best-effort: a
 * file watcher still holding a directory handle, or a hard kill, can outlive
 * it. Naming each root after its owning pid makes the leftovers identifiable --
 * if that pid is gone, so is any claim on the directory -- so litter is bounded
 * to the roots of processes that are actually running right now.
 */
function sweepStaleRoots(): void {
  let entries: string[];
  try {
    entries = readdirSync(systemTemp);
  } catch {
    return;
  }
  for (const entry of entries) {
    const match = /^hm-t-(\d+)$/.exec(entry);
    if (!match) continue;
    const pid = Number(match[1]);
    if (pid === process.pid) continue;
    try {
      // Signal 0 checks for existence without delivering anything.
      process.kill(pid, 0);
      continue; // Still running; leave it alone.
    } catch (error) {
      // EPERM means the pid exists but belongs to someone else -- also leave it.
      if ((error as NodeJS.ErrnoException).code === "EPERM") continue;
    }
    const stale = join(systemTemp, entry);
    try {
      rmSync(stale, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      try {
        makeWritable(stale);
        rmSync(stale, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        // Someone else's problem now; try again next run.
      }
    }
  }
}

sweepStaleRoots();

process.on("exit", sweep);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    sweep();
    process.exit(130);
  });
}
