/**
 * Annotate Server — end-to-end route wiring
 *
 * Boots the real annotate server and exercises route wiring over HTTP.
 *
 * NOTE: this can only run because apps/opencode-plugin/commands.test.ts injects
 * its annotate-server stub via CommandDeps instead of a global `mock.module`.
 * A module mock there would leak the stub into this file (Bun module mocks are
 * process-global and cannot be unset).
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { runGuardedShutdown, startAnnotateServer } from "./annotate";
import { getServerConfig, loadConfig } from "./config";
import { deriveAnnotateHistorySlug } from "@hypermark/shared/annotate-history";
import { getHypermarkDataDir } from "@hypermark/shared/data-dir";

const MINIMAL_HTML = "<html><body>Hypermark</body></html>";

describe("annotate server: SPA fallback", () => {
  let savedPort: string | undefined;

  beforeEach(() => {
    savedPort = process.env.HYPERMARK_PORT;
    delete process.env.HYPERMARK_PORT;
  });

  afterEach(() => {
    if (savedPort === undefined) delete process.env.HYPERMARK_PORT;
    else process.env.HYPERMARK_PORT = savedPort;
  });

  test("an unmatched path falls through to the SPA HTML", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "test.md"),
      htmlContent: MINIMAL_HTML,
    });

    try {
      const response = await fetch(`${server.url}/not-a-real-route`);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toContain("Hypermark");
    } finally {
      server.stop();
    }
  });
});

describe("annotate server: /api/config favicon persistence", () => {
  let savedPort: string | undefined;
  let savedDataDir: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    savedPort = process.env.HYPERMARK_PORT;
    savedDataDir = process.env.HYPERMARK_DATA_DIR;
    delete process.env.HYPERMARK_PORT;
    tempDir = mkdtempSync(join(tmpdir(), "hypermark-annotate-config-test-"));
    process.env.HYPERMARK_DATA_DIR = tempDir;
  });

  afterEach(() => {
    if (savedPort === undefined) delete process.env.HYPERMARK_PORT;
    else process.env.HYPERMARK_PORT = savedPort;
    if (savedDataDir === undefined) delete process.env.HYPERMARK_DATA_DIR;
    else process.env.HYPERMARK_DATA_DIR = savedDataDir;
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("persists classic favicon via POST /api/config and ignores unknown values", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "test.md"),
      htmlContent: MINIMAL_HTML,
    });

    try {
      const validResponse = await fetch(`${server.url}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favicon: "classic" }),
      });
      expect(validResponse.status).toBe(200);
      expect(loadConfig().favicon).toBe("classic");
      expect(getServerConfig(null).favicon).toBe("classic");

      const invalidResponse = await fetch(`${server.url}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favicon: "unknown" }),
      });
      expect(invalidResponse.status).toBe(200);
      // "unknown" was not written into config, so "classic" is retained
      expect(loadConfig().favicon).toBe("classic");
      expect(getServerConfig(null).favicon).toBe("classic");
    } finally {
      server.stop();
    }
  });
});

describe("annotate server: /api/share-html symlink containment", () => {
  let savedPort: string | undefined;

  beforeEach(() => {
    savedPort = process.env.HYPERMARK_PORT;
    delete process.env.HYPERMARK_PORT;
  });

  afterEach(() => {
    if (savedPort === undefined) delete process.env.HYPERMARK_PORT;
    else process.env.HYPERMARK_PORT = savedPort;
  });

  // Regression: /api/share-html read the requested file through a lexical-only
  // containment check, so a symlinked *.html inside the doc directory pointing
  // outside it leaked the target's contents into the share payload. (Completes
  // the #927 symlink fix, which hardened the asset sinks but missed this one.)
  test("rejects a symlinked .html that escapes the document directory", async () => {
    const docDir = mkdtempSync(join(tmpdir(), "hypermark-sharehtml-"));
    const secretDir = mkdtempSync(join(tmpdir(), "hypermark-secret-"));
    const secretPath = join(secretDir, "secret.html");
    writeFileSync(secretPath, "SECRET_OUTSIDE_CONTENT", "utf-8");
    symlinkSync(secretPath, join(docDir, "evil.html"));
    const pagePath = join(docDir, "page.html");
    writeFileSync(pagePath, MINIMAL_HTML, "utf-8");

    const server = await startAnnotateServer({
      markdown: "",
      filePath: pagePath,
      htmlContent: MINIMAL_HTML,
      rawHtml: MINIMAL_HTML,
      renderHtml: true,
    });

    try {
      const response = await fetch(
        `${server.url}/api/share-html?path=${encodeURIComponent(join(docDir, "evil.html"))}`,
      );
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain("SECRET_OUTSIDE_CONTENT");
    } finally {
      server.stop();
    }
  });

});

// A local rendered-HTML root is served from its current bytes by both
// /api/plan (tab reload) and /api/share-html (share after Refresh), with the
// startup snapshot only as the deleted-file fallback. History lives in the
// real data dir (storage resolves it at import time), so every test uses its
// own project namespace, removed in afterAll.
describe("annotate server: local rendered-HTML root freshness", () => {
  let savedPort: string | undefined;
  let savedHistoryFlag: string | undefined;

  beforeEach(() => {
    savedPort = process.env.HYPERMARK_PORT;
    savedHistoryFlag = process.env.HYPERMARK_ANNOTATE_HISTORY;
    delete process.env.HYPERMARK_PORT;
    process.env.HYPERMARK_ANNOTATE_HISTORY = "1";
  });

  afterEach(() => {
    if (savedPort === undefined) delete process.env.HYPERMARK_PORT;
    else process.env.HYPERMARK_PORT = savedPort;
    if (savedHistoryFlag === undefined) delete process.env.HYPERMARK_ANNOTATE_HISTORY;
    else process.env.HYPERMARK_ANNOTATE_HISTORY = savedHistoryFlag;
  });

  const mintedProjects: string[] = [];
  function uniqueProject(label: string): string {
    const project = `_annotate_root_html_test_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    mintedProjects.push(project);
    return project;
  }

  afterAll(() => {
    const historyDir = join(getHypermarkDataDir(), "history");
    for (const project of mintedProjects) {
      rmSync(join(historyDir, project), { recursive: true, force: true });
    }
  });

  const page = (marker: string) => `<html><body>${marker}</body></html>`;
  // realpath so the deleted-file fallback is reachable: containment realpaths
  // the root but keeps a missing target's lexical path, which on a symlinked
  // tmpdir (macOS) would never match.
  const freshDocDir = (label: string) => realpathSync(mkdtempSync(join(tmpdir(), `hypermark-root-html-${label}-`)));

  test("/api/share-html shares the root document's current bytes after the file changes on disk", async () => {
    const pagePath = join(freshDocDir("share"), "page.html");
    writeFileSync(pagePath, page("STARTUP_VERSION"), "utf-8");

    const server = await startAnnotateServer({
      markdown: "",
      filePath: pagePath,
      htmlContent: MINIMAL_HTML,
      rawHtml: page("STARTUP_VERSION"),
      renderHtml: true,
      project: uniqueProject("share"),
    });

    try {
      writeFileSync(pagePath, page("REFRESHED_VERSION"), "utf-8");
      const refreshed = await (await fetch(
        `${server.url}/api/share-html?path=${encodeURIComponent(pagePath)}`,
      )).json() as { shareHtml: string };
      expect(refreshed.shareHtml).toContain("REFRESHED_VERSION");
      expect(refreshed.shareHtml).not.toContain("STARTUP_VERSION");

      unlinkSync(pagePath);
      const fallback = await (await fetch(`${server.url}/api/share-html`)).json() as { shareHtml: string };
      expect(fallback.shareHtml).toContain("STARTUP_VERSION");
    } finally {
      server.stop();
    }
  });

  // A tab reload after an agent edit must show the edited page (the draft
  // annotations were placed on it) AND keep the version diff: the saved
  // baseline is still the previous version, so the diff is recomputed
  // against the served bytes rather than dropped (a reload used to lose the
  // "Show changes" toggle for the rest of the session). Reads never write
  // history.
  test("/api/plan serves the root document's current bytes and recomputes the version diff against them", async () => {
    const pagePath = join(freshDocDir("plan"), "page.html");
    const project = uniqueProject("plan");
    type PlanPayload = {
      rawHtml?: string;
      previousPlan?: string | null;
      versionInfo?: { version: number };
      diffCurrent?: string;
      diffHtml?: string;
    };

    // Session 1 saves V1 as version 1 so session 2 has a baseline to diff.
    writeFileSync(pagePath, page("V1"), "utf-8");
    const seed = await startAnnotateServer({
      markdown: "",
      filePath: pagePath,
      htmlContent: MINIMAL_HTML,
      rawHtml: page("V1"),
      renderHtml: true,
      project,
    });
    seed.stop();

    writeFileSync(pagePath, page("V2"), "utf-8");
    const server = await startAnnotateServer({
      markdown: "",
      filePath: pagePath,
      htmlContent: MINIMAL_HTML,
      rawHtml: page("V2"),
      renderHtml: true,
      project,
    });
    const plan = async () => (await (await fetch(`${server.url}/api/plan`)).json()) as PlanPayload;

    try {
      const startup = await plan();
      expect(startup.rawHtml).toContain("V2");
      expect(startup.previousPlan).toBe(page("V1"));
      expect(startup.versionInfo?.version).toBe(2);
      expect(startup.diffHtml).toBeDefined();

      writeFileSync(pagePath, page("V3"), "utf-8");
      const reloaded = await plan();
      expect(reloaded.rawHtml).toContain("V3");
      expect(reloaded.rawHtml).not.toContain("V2");
      // The baseline still names the saved previous version...
      expect(reloaded.previousPlan).toBe(page("V1"));
      expect(reloaded.versionInfo?.version).toBe(2);
      // ...and the diff describes V1 -> V3, the page actually on screen.
      expect(reloaded.diffCurrent).toBe(page("V3"));
      expect(reloaded.diffHtml).toContain("<ins");
      expect(reloaded.diffHtml).toContain("V3");
      expect(reloaded.diffHtml).not.toContain("V2");

      // The in-app Refresh reads the root through /api/doc: the same
      // recomputed diff rides along for the ROOT document only.
      const refreshed = (await (await fetch(
        `${server.url}/api/doc?path=${encodeURIComponent(pagePath)}`,
      )).json()) as PlanPayload & { renderAs?: string };
      expect(refreshed.renderAs).toBe("html");
      expect(refreshed.rawHtml).toContain("V3");
      expect(refreshed.previousPlan).toBe(page("V1"));
      expect(refreshed.versionInfo?.version).toBe(2);
      expect(refreshed.diffHtml).toBe(reloaded.diffHtml);

      // A sibling document served through /api/doc carries no version fields.
      const siblingPath = join(dirname(pagePath), "sibling.html");
      writeFileSync(siblingPath, page("SIBLING"), "utf-8");
      const sibling = (await (await fetch(
        `${server.url}/api/doc?path=${encodeURIComponent(siblingPath)}`,
      )).json()) as PlanPayload;
      expect(sibling.rawHtml).toContain("SIBLING");
      expect(sibling.previousPlan).toBeUndefined();
      expect(sibling.diffHtml).toBeUndefined();

      // The saved history is untouched by reads: still exactly the two versions.
      const versions = (await (await fetch(`${server.url}/api/plan/versions`)).json()) as { versions: unknown[] };
      expect(versions.versions).toHaveLength(2);

      unlinkSync(pagePath);
      const fallback = await plan();
      expect(fallback.rawHtml).toContain("V2");
      expect(fallback.previousPlan).toBe(page("V1"));
      expect(fallback.diffHtml).toBeDefined();
    } finally {
      server.stop();
    }
  });

  // A root that exists but cannot be read is the missing-file fallback: the
  // startup snapshot, with its version diff, and the share endpoint agrees.
  // On Bun, Bun.file(dir).exists() is false, so a path replaced by a
  // directory already took the missing path; the chmod 000 case below
  // is the one that made the Bun handler throw and answer 500.
  async function seedTwoVersions(label: string): Promise<{ pagePath: string; project: string }> {
    const pagePath = join(freshDocDir(label), "page.html");
    const project = uniqueProject(label);
    writeFileSync(pagePath, page("V1"), "utf-8");
    const seed = await startAnnotateServer({
      markdown: "",
      filePath: pagePath,
      htmlContent: MINIMAL_HTML,
      rawHtml: page("V1"),
      renderHtml: true,
      project,
    });
    seed.stop();
    writeFileSync(pagePath, page("V2"), "utf-8");
    return { pagePath, project };
  }

  type FallbackPayload = { rawHtml?: string; previousPlan?: string | null; versionInfo?: { version: number }; diffHtml?: string };

  test("/api/plan falls back to the startup snapshot (with its version diff) when the root path becomes a directory", async () => {
    const { pagePath, project } = await seedTwoVersions("dir");
    const server = await startAnnotateServer({
      markdown: "",
      filePath: pagePath,
      htmlContent: MINIMAL_HTML,
      rawHtml: page("V2"),
      renderHtml: true,
      project,
    });
    try {
      unlinkSync(pagePath);
      mkdirSync(pagePath);
      const res = await fetch(`${server.url}/api/plan`);
      expect(res.status).toBe(200);
      const fallback = (await res.json()) as FallbackPayload;
      expect(fallback.rawHtml).toContain("V2");
      expect(fallback.previousPlan).toBe(page("V1"));
      expect(fallback.versionInfo?.version).toBe(2);
      expect(fallback.diffHtml).toBeDefined();

      const share = await fetch(`${server.url}/api/share-html`);
      expect(share.status).toBe(200);
      expect(((await share.json()) as { shareHtml: string }).shareHtml).toContain("V2");
    } finally {
      server.stop();
    }
  });

  // chmod 000 is not a restriction for root, so the check is skipped there.
  const canRevokeRead = process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() !== 0;
  test.skipIf(!canRevokeRead)("/api/plan falls back to the startup snapshot when the root file is unreadable", async () => {
    const { pagePath, project } = await seedTwoVersions("perm");
    const server = await startAnnotateServer({
      markdown: "",
      filePath: pagePath,
      htmlContent: MINIMAL_HTML,
      rawHtml: page("V2"),
      renderHtml: true,
      project,
    });
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); };
    try {
      writeFileSync(pagePath, page("V3"), "utf-8");
      chmodSync(pagePath, 0o000);
      const res = await fetch(`${server.url}/api/plan`);
      expect(res.status).toBe(200);
      const fallback = (await res.json()) as FallbackPayload;
      expect(fallback.rawHtml).toContain("V2");
      expect(fallback.rawHtml).not.toContain("V3");
      expect(fallback.previousPlan).toBe(page("V1"));
      expect(fallback.diffHtml).toBeDefined();
      // The fallback is silent to the reviewer, so the reason is logged once
      // per process (path and error), not once per read.
      await fetch(`${server.url}/api/plan`);
      const rootWarnings = warnings.filter((w) => w.includes("could not read the HTML root"));
      expect(rootWarnings).toHaveLength(1);
      expect(rootWarnings[0]).toContain(pagePath);
    } finally {
      console.warn = originalWarn;
      chmodSync(pagePath, 0o644);
      server.stop();
    }
  });
});

describe("annotate server: approval notes", () => {
  let savedPort: string | undefined;

  beforeEach(() => {
    savedPort = process.env.HYPERMARK_PORT;
    delete process.env.HYPERMARK_PORT;
  });

  afterEach(() => {
    if (savedPort === undefined) delete process.env.HYPERMARK_PORT;
    else process.env.HYPERMARK_PORT = savedPort;
  });

  test("returns the explicit approval-notes capability", async () => {
    for (const approvalNotesSupported of [true, false]) {
      const server = await startAnnotateServer({
        markdown: "# Test",
        filePath: join(tmpdir(), "approval-capability.md"),
        htmlContent: MINIMAL_HTML,
        approvalNotesSupported,
      });

      try {
        const response = await fetch(`${server.url}/api/plan`);
        const plan = await response.json() as { approvalNotesSupported?: boolean };
        expect(plan.approvalNotesSupported).toBe(approvalNotesSupported);
      } finally {
        server.stop();
      }
    }
  });

  test("preserves feedback and annotations on approval", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "approval-notes.md"),
      htmlContent: MINIMAL_HTML,
      approvalNotesSupported: true,
    });

    try {
      const response = await fetch(`${server.url}/api/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback: "Keep the retry bounded.",
          annotations: [{ id: "a1" }],
          draftGeneration: 3,
        }),
      });

      expect(response.status).toBe(200);
      expect(await server.waitForDecision()).toEqual({
        approved: true,
        feedback: "Keep the retry bounded.",
        annotations: [{ id: "a1" }],
      });
    } finally {
      server.stop();
    }
  });

  // Approve-with-notes must anchor exactly where Send Feedback would. Dropping
  // the message scope made the notes land on the last message rather than the
  // one the reviewer picked in a multi-message annotate-last session.
  test("forwards the message scope on approval", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "approval-message-scope.md"),
      htmlContent: MINIMAL_HTML,
      approvalNotesSupported: true,
    });

    try {
      const response = await fetch(`${server.url}/api/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback: "Scope this to the picked message.",
          annotations: [],
          selectedMessageId: "message-2",
          feedbackScope: "messages",
        }),
      });

      expect(response.status).toBe(200);
      expect(await server.waitForDecision()).toEqual({
        approved: true,
        feedback: "Scope this to the picked message.",
        annotations: [],
        selectedMessageId: "message-2",
        feedbackScope: "messages",
      });
    } finally {
      server.stop();
    }
  });

  test("keeps bodyless approval compatible", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "approval-bodyless.md"),
      htmlContent: MINIMAL_HTML,
    });

    try {
      const response = await fetch(`${server.url}/api/approve`, { method: "POST" });
      expect(response.status).toBe(200);
      expect(await server.waitForDecision()).toEqual({
        approved: true,
        feedback: "",
        annotations: [],
      });
    } finally {
      server.stop();
    }
  });

  test("rejects malformed or wrong-type approval bodies without resolving", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "approval-invalid.md"),
      htmlContent: MINIMAL_HTML,
    });

    try {
      const decision = server.waitForDecision();
      const malformed = await fetch(`${server.url}/api/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      });
      expect(malformed.status).toBe(400);
      expect(await Promise.race([decision.then(() => "resolved"), Bun.sleep(25).then(() => "pending")])).toBe("pending");

      const wrongType = await fetch(`${server.url}/api/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: 42, annotations: [] }),
      });
      expect(wrongType.status).toBe(400);
      expect(await Promise.race([decision.then(() => "resolved"), Bun.sleep(25).then(() => "pending")])).toBe("pending");

      await fetch(`${server.url}/api/approve`, { method: "POST" });
      expect(await decision).toEqual({ approved: true, feedback: "", annotations: [] });
    } finally {
      server.stop();
    }
  });
});

describe("annotate server: client lease", () => {
  let savedPort: string | undefined;

  beforeEach(() => {
    savedPort = process.env.HYPERMARK_PORT;
    delete process.env.HYPERMARK_PORT;
  });

  afterEach(() => {
    if (savedPort === undefined) delete process.env.HYPERMARK_PORT;
    else process.env.HYPERMARK_PORT = savedPort;
  });

  /**
   * Connect to the client-lease stream and wait for its first byte (the
   * ready comment). Returns a `disconnect()` that aborts the underlying
   * fetch — plain `reader.cancel()` only stops local reads and does not
   * propagate a close to the server's `ReadableStream.cancel()`, whereas
   * aborting the request closes the connection the way an abandoned browser
   * tab actually would.
   */
  async function connectClientLease(url: string): Promise<{ disconnect: () => Promise<void> }> {
    const controller = new AbortController();
    const response = await fetch(`${url}/api/annotate/client-lease`, { signal: controller.signal });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const first = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Timed out waiting for ready comment")), 1000);
      }),
    ]);
    expect(first.done).toBe(false);
    return {
      disconnect: async () => {
        controller.abort();
        await reader.cancel().catch(() => {});
      },
    };
  }

  /**
   * Track whether a promise has settled without racing it against a timer —
   * a `Promise.race` between an already-resolved sentinel and a promise that
   * may or may not have settled is nondeterministic. Attaching `.then` up
   * front and reading a flag afterward is reliable regardless of timing.
   */
  function trackSettled<T>(promise: Promise<T>): () => boolean {
    let settled = false;
    promise.then(() => {
      settled = true;
    });
    return () => settled;
  }

  test("resolves the decision as dismissed after the last client disconnects and the grace period elapses", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "client-lease-expiry.md"),
      htmlContent: MINIMAL_HTML,
      gate: true,
      approvalNotesSupported: true,
      clientLeaseTestOverrides: { graceMs: 50 },
    });

    try {
      const decision = server.waitForDecision();
      const isSettled = trackSettled(decision);
      const client = await connectClientLease(server.url);

      // Still connected — no expiry.
      await Bun.sleep(20);
      expect(isSettled()).toBe(false);

      await client.disconnect();

      expect(await decision).toEqual({ feedback: "", annotations: [], exit: true });
    } finally {
      server.stop();
    }
  });

  test("a reconnect before the grace deadline cancels the pending expiry", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "client-lease-reconnect.md"),
      htmlContent: MINIMAL_HTML,
      gate: true,
      approvalNotesSupported: true,
      clientLeaseTestOverrides: { graceMs: 80 },
    });

    try {
      const decision = server.waitForDecision();
      const isSettled = trackSettled(decision);

      const firstClient = await connectClientLease(server.url);
      await firstClient.disconnect();

      // Reconnect well before the 80ms grace deadline.
      await Bun.sleep(20);
      const secondClient = await connectClientLease(server.url);

      // Even past the original deadline, the reconnect cancelled the pending expiry.
      await Bun.sleep(100);
      expect(isSettled()).toBe(false);

      // A fresh disconnect starts its own full grace window.
      await secondClient.disconnect();
      expect(await decision).toEqual({ feedback: "", annotations: [], exit: true });
    } finally {
      server.stop();
    }
  });

  test("an explicit approval wins over a later client-lease expiry", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "client-lease-explicit-decision.md"),
      htmlContent: MINIMAL_HTML,
      gate: true,
      approvalNotesSupported: true,
      clientLeaseTestOverrides: { graceMs: 60 },
    });

    try {
      const client = await connectClientLease(server.url);

      const approve = await fetch(`${server.url}/api/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "Looks good.", annotations: [] }),
      });
      expect(approve.status).toBe(200);
      expect(await server.waitForDecision()).toEqual({
        approved: true,
        feedback: "Looks good.",
        annotations: [],
      });

      // Disconnecting after the explicit decision must not overwrite it once
      // the grace period elapses — the approval already cancelled tracking.
      await client.disconnect();
      await Bun.sleep(120);
      expect(await server.waitForDecision()).toEqual({
        approved: true,
        feedback: "Looks good.",
        annotations: [],
      });
    } finally {
      server.stop();
    }
  });

  test("a decision arriving after the lease expired is rejected instead of reported as applied", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "client-lease-late-decision.md"),
      htmlContent: MINIMAL_HTML,
      gate: true,
      approvalNotesSupported: true,
      clientLeaseTestOverrides: { graceMs: 30 },
    });

    try {
      const client = await connectClientLease(server.url);
      await client.disconnect();
      expect(await server.waitForDecision()).toEqual({
        feedback: "",
        annotations: [],
        exit: true,
      });

      // A tab that never saw the dismissal must not be told its decision was
      // applied: the caller already received `dismissed`.
      for (const [path, init] of [
        [
          "/api/approve",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feedback: "Looks good.", annotations: [] }),
          },
        ],
        [
          "/api/feedback",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feedback: "Please change this.", annotations: [] }),
          },
        ],
        ["/api/exit", { method: "POST" }],
      ] as const) {
        const response = await fetch(`${server.url}${path}`, init);
        expect(response.status).toBe(409);
      }

      expect(await server.waitForDecision()).toEqual({
        feedback: "",
        annotations: [],
        exit: true,
      });
    } finally {
      server.stop();
    }
  });

  test("stopping the server ends live lease streams", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "client-lease-stop.md"),
      htmlContent: MINIMAL_HTML,
      gate: true,
      approvalNotesSupported: true,
    });

    const response = await fetch(`${server.url}/api/annotate/client-lease`);
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe(": ready\n\n");

    server.stop();

    // The stream must complete rather than stay open on a server that is gone.
    const next = await reader.read();
    expect(next.done).toBe(true);
  });
});

describe("annotate server: durable submit records (#678)", () => {
  // The decision promise's consumer (the invoking CLI/agent) can time out
  // before the reviewer submits; the submit then settled the promise with
  // nobody listening, deleted the draft, and the feedback existed nowhere.
  // These tests pin the fix: a durable record is written to
  // history/{project}/{slug}/submissions/ BEFORE the draft is deleted, the
  // annotate-history opt-out suppresses the record (stateless sessions keep
  // legacy behavior), and a failed durable write keeps the draft behind as
  // the recovery copy.
  let savedPort: string | undefined;
  let savedHistoryFlag: string | undefined;

  beforeEach(() => {
    savedPort = process.env.HYPERMARK_PORT;
    savedHistoryFlag = process.env.HYPERMARK_ANNOTATE_HISTORY;
    delete process.env.HYPERMARK_PORT;
    // Force the toggle on unless a test explicitly flips it off — a real
    // ~/.hypermark/config.json must never change the outcome.
    process.env.HYPERMARK_ANNOTATE_HISTORY = "1";
  });

  afterEach(() => {
    if (savedPort === undefined) delete process.env.HYPERMARK_PORT;
    else process.env.HYPERMARK_PORT = savedPort;
    if (savedHistoryFlag === undefined) delete process.env.HYPERMARK_ANNOTATE_HISTORY;
    else process.env.HYPERMARK_ANNOTATE_HISTORY = savedHistoryFlag;
  });

  // History lives in the real data dir (DATA_DIR is cached at module import),
  // so each test uses a unique project namespace and afterAll removes it.
  const mintedProjects: string[] = [];
  function uniqueProject(label: string): string {
    const project = `_annotate_submission_test_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    mintedProjects.push(project);
    return project;
  }

  afterAll(() => {
    const historyDir = join(getHypermarkDataDir(), "history");
    for (const project of mintedProjects) {
      rmSync(join(historyDir, project), { recursive: true, force: true });
    }
  });

  function submissionsDir(project: string, docPath: string): string {
    return join(
      getHypermarkDataDir(),
      "history",
      project,
      deriveAnnotateHistorySlug(resolve(docPath)),
      "submissions",
    );
  }

  // The project name is baked into the markdown so every test gets a unique
  // content-hashed draft key — drafts live in the real data dir and identical
  // markdown across tests would collide on one draft file.
  async function startServer(project: string, docPath: string) {
    const markdown = `# Doc ${project}\n\nBody\n`;
    writeFileSync(docPath, markdown, "utf-8");
    return startAnnotateServer({
      markdown,
      filePath: docPath,
      htmlContent: MINIMAL_HTML,
      project,
    });
  }

  test("feedback submit writes a durable record and only then deletes the draft", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hypermark-submit-durable-"));
    const docPath = join(dir, "doc.md");
    const project = uniqueProject("feedback");
    const server = await startServer(project, docPath);

    try {
      // Auto-saved draft exists before submit (the recovery copy).
      const saved = await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: [{ id: "a1" }] }),
      });
      expect(saved.status).toBe(200);

      const response = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback: "## Feedback\n\nPlease fix X in the second paragraph.",
          annotations: [{ id: "a1" }],
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });

      // Durable record: one markdown file next to the file's version history.
      const recordDir = submissionsDir(project, docPath);
      const records = readdirSync(recordDir).filter((f) => f.endsWith(".md"));
      expect(records.length).toBe(1);
      const content = readFileSync(join(recordDir, records[0]), "utf-8");
      expect(content).toContain("Please fix X in the second paragraph.");
      expect(content).toContain("- Decision: feedback");
      expect(content).toContain(`- Source: ${resolve(docPath)}`);

      // Draft is gone AFTER the record exists.
      const draft = await fetch(`${server.url}/api/draft`);
      expect(draft.status).toBe(404);
    } finally {
      server.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("approve with notes persists a record; a bare approve writes nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hypermark-submit-approve-"));

    // Approve-with-notes carries user content -> record.
    const notesDoc = join(dir, "notes.md");
    const notesProject = uniqueProject("approve-notes");
    const notesServer = await startServer(notesProject, notesDoc);
    try {
      const response = await fetch(`${notesServer.url}/api/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "LGTM, but rename the helper.", annotations: [] }),
      });
      expect(response.status).toBe(200);
      const recordDir = submissionsDir(notesProject, notesDoc);
      const records = readdirSync(recordDir).filter((f) => f.endsWith(".md"));
      expect(records.length).toBe(1);
      const content = readFileSync(join(recordDir, records[0]), "utf-8");
      expect(content).toContain("LGTM, but rename the helper.");
      expect(content).toContain("- Decision: approved (with notes)");
    } finally {
      notesServer.stop();
    }

    // Bare approve is contentless -> nothing to persist.
    const bareDoc = join(dir, "bare.md");
    const bareProject = uniqueProject("approve-bare");
    const bareServer = await startServer(bareProject, bareDoc);
    try {
      const response = await fetch(`${bareServer.url}/api/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(200);
      expect(existsSync(submissionsDir(bareProject, bareDoc))).toBe(false);
    } finally {
      bareServer.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("annotateHistory disabled: no content is written and the draft is deleted (legacy behavior)", async () => {
    process.env.HYPERMARK_ANNOTATE_HISTORY = "0";
    const dir = mkdtempSync(join(tmpdir(), "hypermark-submit-optout-"));
    const docPath = join(dir, "doc.md");
    const project = uniqueProject("opt-out");
    const server = await startServer(project, docPath);

    try {
      await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: [{ id: "a1" }] }),
      });

      const response = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "Secret excerpt", annotations: [{ id: "a1" }] }),
      });
      expect(response.status).toBe(200);

      // The opt-out means "no annotate content in the data dir": no version
      // snapshot AND no submission record — the project dir never appears.
      expect(existsSync(join(getHypermarkDataDir(), "history", project))).toBe(false);
      // Legacy behavior preserved: the draft is still deleted on submit.
      const draft = await fetch(`${server.url}/api/draft`);
      expect(draft.status).toBe(404);
    } finally {
      server.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("previously-stateless modes stay stateless: annotate-last and URL sessions write no record", async () => {
    // Before #678 these modes never touched the data dir; the durable record
    // must not widen the documented annotateHistory contract to them — their
    // submissions quote agent messages or fetched pages.
    const lastProject = uniqueProject("last-message");
    const lastServer = await startAnnotateServer({
      markdown: `# Agent message ${lastProject}\n\nQuoted agent output.\n`,
      filePath: "last-message",
      htmlContent: MINIMAL_HTML,
      project: lastProject,
      mode: "annotate-last",
    });
    try {
      const response = await fetch(`${lastServer.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "Quoting the agent: do Y instead.", annotations: [] }),
      });
      expect(response.status).toBe(200);
      expect(existsSync(join(getHypermarkDataDir(), "history", lastProject))).toBe(false);
    } finally {
      lastServer.stop();
    }

    const urlProject = uniqueProject("url");
    const urlServer = await startAnnotateServer({
      markdown: `# Fetched page ${urlProject}\n\nPage content.\n`,
      filePath: "https://example.com/some/page",
      htmlContent: MINIMAL_HTML,
      project: urlProject,
    });
    try {
      const response = await fetch(`${urlServer.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "The fetched page says Z.", annotations: [] }),
      });
      expect(response.status).toBe(200);
      expect(existsSync(join(getHypermarkDataDir(), "history", urlProject))).toBe(false);
    } finally {
      urlServer.stop();
    }
  });

  test("a malformed feedback body degrades to legacy behavior, never a 500", async () => {
    // /api/feedback does no body type validation; pre-#678 a non-string
    // feedback flowed through settle() untouched and returned 200. The
    // durable-record guard must not turn that into a thrown 500.
    const dir = mkdtempSync(join(tmpdir(), "hypermark-submit-malformed-"));
    const docPath = join(dir, "doc.md");
    const project = uniqueProject("malformed");
    const server = await startServer(project, docPath);

    try {
      await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: [{ id: "a1" }] }),
      });

      const response = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: 42, annotations: [] }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      // Legacy behavior: draft deleted, no record (nothing persistable).
      const draft = await fetch(`${server.url}/api/draft`);
      expect(draft.status).toBe(404);
      expect(existsSync(submissionsDir(project, docPath))).toBe(false);
    } finally {
      server.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a failed durable write keeps the draft as the recovery copy", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hypermark-submit-unwritable-"));
    const docPath = join(dir, "doc.md");
    const project = uniqueProject("unwritable");
    // Plant a FILE where the project's history directory must go: every
    // mkdir under it fails, so both the startup snapshot and the submission
    // write degrade. (afterAll's recursive+force rm removes the file too.)
    const historyRoot = join(getHypermarkDataDir(), "history");
    mkdirSync(historyRoot, { recursive: true });
    writeFileSync(join(historyRoot, project), "not a directory", "utf-8");
    const server = await startServer(project, docPath);

    try {
      await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: [{ id: "a1" }] }),
      });

      const response = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "Please fix X", annotations: [{ id: "a1" }] }),
      });
      // The decision itself still succeeds — persistence is an enhancement.
      expect(response.status).toBe(200);

      // But the draft survives: with no durable record written, it is the
      // only remaining copy of the reviewer's work.
      const draft = await fetch(`${server.url}/api/draft`);
      expect(draft.status).toBe(200);

      // Cleanup: don't leave this test's draft behind in the real data dir.
      await fetch(`${server.url}/api/draft`, { method: "DELETE" });
    } finally {
      server.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("annotate server: guarded shutdown (runGuardedShutdown)", () => {
  // Teardown is historically fragile (#1314); in a flat
  // sequence a throw there would skip every disposal step after it. Each
  // step must run even when an earlier one throws, and the listener close
  // must run regardless.
  test("a throwing disposer does not skip later steps or the listener close", () => {
    const ran: string[] = [];
    const logged: string[] = [];
    runGuardedShutdown(
      [
        ["step-one", () => {
          ran.push("step-one");
          throw new Error("teardown exploded");
        }],
        ["live proxy", () => ran.push("live proxy")],
      ],
      () => ran.push("listener"),
      (message) => logged.push(message),
    );
    expect(ran).toEqual(["step-one", "live proxy", "listener"]);
    // The failure is reported, named after the step that threw.
    expect(logged.some((line) => line.includes("step-one"))).toBe(true);
  });

  test("all steps clean: everything runs once in order, nothing is logged", () => {
    const ran: string[] = [];
    const logged: string[] = [];
    runGuardedShutdown(
      [
        ["a", () => ran.push("a")],
        ["b", () => ran.push("b")],
      ],
      () => ran.push("listener"),
      (message) => logged.push(message),
    );
    expect(ran).toEqual(["a", "b", "listener"]);
    expect(logged).toEqual([]);
  });
});
