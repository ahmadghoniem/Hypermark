import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  findParentPid,
  isProcessAlive,
  parseProcessTableCsv,
  parseProcessTablePs,
  startParentWatch,
} from "./parent-watch";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("isProcessAlive", () => {
  test("reports the current process as alive", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  test("reports an implausible PID as not alive", () => {
    // PID 999999999 is well beyond any real process table.
    expect(isProcessAlive(999_999_999)).toBe(false);
  });
});

describe("parseProcessTablePs", () => {
  test("parses pid/ppid pairs, skipping malformed lines", () => {
    const table = parseProcessTablePs("1 0\n123 1\n\nnot-a-pid also-not\n456 123\n");
    expect(table.get(123)).toBe(1);
    expect(table.get(456)).toBe(123);
    expect(table.size).toBe(3);
  });
});

describe("parseProcessTableCsv", () => {
  test("parses PowerShell ConvertTo-Csv output, skipping the header", () => {
    const csv = '"ProcessId","ParentProcessId"\n"123","1"\n"456","123"\n';
    const table = parseProcessTableCsv(csv);
    expect(table.get(123)).toBe(1);
    expect(table.get(456)).toBe(123);
    expect(table.size).toBe(2);
  });
});

describe("findParentPid", () => {
  test("returns startPid when it has session metadata directly", () => {
    const sessionsDir = mkdtempSync(join(tmpdir(), "hm-parent-watch-"));
    try {
      writeFileSync(join(sessionsDir, "500.json"), "{}");
      const pid = findParentPid({ startPid: 500, sessionsDir, getParentPid: () => null });
      expect(pid).toBe(500);
    } finally {
      rmSync(sessionsDir, { recursive: true, force: true });
    }
  });

  test("walks past a subshell to find the ancestor with session metadata", () => {
    const sessionsDir = mkdtempSync(join(tmpdir(), "hm-parent-watch-"));
    try {
      // hypermark (500) -> subshell (400, no metadata) -> Claude Code (300, has metadata)
      writeFileSync(join(sessionsDir, "300.json"), "{}");
      const parents: Record<number, number> = { 500: 400, 400: 300, 300: 1 };
      const pid = findParentPid({
        startPid: 500,
        sessionsDir,
        getParentPid: (p) => parents[p] ?? null,
      });
      expect(pid).toBe(300);
    } finally {
      rmSync(sessionsDir, { recursive: true, force: true });
    }
  });

  test("falls back to startPid when no ancestor has session metadata", () => {
    const sessionsDir = mkdtempSync(join(tmpdir(), "hm-parent-watch-"));
    try {
      const parents: Record<number, number> = { 500: 400, 400: 1 };
      const pid = findParentPid({
        startPid: 500,
        sessionsDir,
        getParentPid: (p) => parents[p] ?? null,
      });
      expect(pid).toBe(500);
    } finally {
      rmSync(sessionsDir, { recursive: true, force: true });
    }
  });

  test("stops after maxHops even with a cycle-free long chain", () => {
    const sessionsDir = mkdtempSync(join(tmpdir(), "hm-parent-watch-"));
    try {
      mkdirSync(sessionsDir, { recursive: true });
      // No PID in the chain has metadata; getParentPid always has an answer,
      // so without a hop limit this would loop until `current <= 1`.
      const pid = findParentPid({
        startPid: 100,
        sessionsDir,
        maxHops: 3,
        getParentPid: (p) => p + 1,
      });
      expect(pid).toBe(100);
    } finally {
      rmSync(sessionsDir, { recursive: true, force: true });
    }
  });
});

describe("startParentWatch", () => {
  test("does nothing while the parent stays alive", async () => {
    let goneCalls = 0;
    let parentGoneCalls = 0;
    const watcher = startParentWatch({
      parentPid: 12345,
      pollIntervalMs: 10,
      graceMs: 10,
      isAlive: () => true,
      onParentGone: () => parentGoneCalls++,
      onGone: () => goneCalls++,
    });
    await wait(60);
    watcher.stop();
    expect(parentGoneCalls).toBe(0);
    expect(goneCalls).toBe(0);
  });

  test("announces immediately and settles after the grace period once the parent is gone", async () => {
    let goneCalls = 0;
    let parentGoneCalls = 0;
    let alive = true;
    const watcher = startParentWatch({
      parentPid: 12345,
      pollIntervalMs: 10,
      graceMs: 30,
      isAlive: () => alive,
      onParentGone: () => parentGoneCalls++,
      onGone: () => goneCalls++,
    });

    alive = false;
    // First poll tick (>=10ms) detects the parent is gone and announces.
    await wait(20);
    expect(parentGoneCalls).toBe(1);
    expect(goneCalls).toBe(0);

    // Grace period (30ms) elapses next.
    await wait(40);
    expect(goneCalls).toBe(1);
    watcher.stop();
  });

  test("fires onGone immediately when graceMs is 0", async () => {
    let goneCalls = 0;
    const watcher = startParentWatch({
      parentPid: 12345,
      pollIntervalMs: 10,
      graceMs: 0,
      isAlive: () => false,
      onGone: () => goneCalls++,
    });
    await wait(20);
    expect(goneCalls).toBe(1);
    watcher.stop();
  });

  test("stop() before the grace period elapses suppresses onGone", async () => {
    let goneCalls = 0;
    const watcher = startParentWatch({
      parentPid: 12345,
      pollIntervalMs: 10,
      graceMs: 50,
      isAlive: () => false,
      onGone: () => goneCalls++,
    });
    await wait(15);
    watcher.stop();
    await wait(60);
    expect(goneCalls).toBe(0);
  });

  test("never fires when parentPid is missing or <= 1", () => {
    let goneCalls = 0;
    const watcher = startParentWatch({
      parentPid: 1,
      isAlive: () => false,
      onGone: () => goneCalls++,
    });
    expect(watcher.parentPid).toBe(1);
    watcher.stop();
    expect(goneCalls).toBe(0);
  });

  test("resolves a real parentPid by default when none is supplied", () => {
    const watcher = startParentWatch({ onGone: () => {} });
    expect(watcher.parentPid).toBeGreaterThan(0);
    watcher.stop();
  });
});
