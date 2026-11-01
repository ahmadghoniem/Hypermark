/**
 * Annotate Server — end-to-end route wiring
 *
 * Boots the real annotate server and exercises route wiring over HTTP.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "os";
import { join } from "path";
import { runGuardedShutdown, startAnnotateServer } from "./annotate";
import { getServerConfig, loadConfig } from "@/shared/config";

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
      expect(getServerConfig().favicon).toBe("classic");

      const invalidResponse = await fetch(`${server.url}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favicon: "unknown" }),
      });
      expect(invalidResponse.status).toBe(200);
      // "unknown" was not written into config, so "classic" is retained
      expect(loadConfig().favicon).toBe("classic");
      expect(getServerConfig().favicon).toBe("classic");
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

  test("an explicit decision wins over a later client-lease expiry", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "client-lease-explicit-decision.md"),
      htmlContent: MINIMAL_HTML,
      clientLeaseTestOverrides: { graceMs: 60 },
    });

    try {
      const client = await connectClientLease(server.url);

      const send = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "Looks good.", annotations: [] }),
      });
      expect(send.status).toBe(200);
      expect(await server.waitForDecision()).toMatchObject({
        feedback: "Looks good.",
        annotations: [],
      });

      // Disconnecting after the explicit decision must not overwrite it once
      // the grace period elapses — the decision already cancelled tracking.
      await client.disconnect();
      await Bun.sleep(120);
      const settled = await server.waitForDecision();
      expect(settled).toMatchObject({ feedback: "Looks good.", annotations: [] });
      expect(settled.exit).toBeUndefined();
    } finally {
      server.stop();
    }
  });

  test("a decision arriving after the lease expired is rejected instead of reported as applied", async () => {
    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: join(tmpdir(), "client-lease-late-decision.md"),
      htmlContent: MINIMAL_HTML,
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

describe("annotate server: guarded shutdown (runGuardedShutdown)", () => {
  // Teardown is historically fragile; in a flat
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

describe("annotate server: annotate-last message selection and draft key", () => {
  let savedPort: string | undefined;
  let savedDataDir: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    savedPort = process.env.HYPERMARK_PORT;
    savedDataDir = process.env.HYPERMARK_DATA_DIR;
    delete process.env.HYPERMARK_PORT;
    tempDir = mkdtempSync(join(tmpdir(), "hypermark-annotate-last-test-"));
    process.env.HYPERMARK_DATA_DIR = tempDir;
  });

  afterEach(() => {
    if (savedPort === undefined) delete process.env.HYPERMARK_PORT;
    else process.env.HYPERMARK_PORT = savedPort;
    if (savedDataDir === undefined) delete process.env.HYPERMARK_DATA_DIR;
    else process.env.HYPERMARK_DATA_DIR = savedDataDir;
    rmSync(tempDir, { recursive: true, force: true });
  });

  const recentMessages = [
    { messageId: "hidden", text: "Annotation session closed.", hidden: true },
    { messageId: "shown", text: "# A longer message" },
  ];

  test("/api/document names the message whose text is markdown", async () => {
    const server = await startAnnotateServer({
      markdown: "# A longer message",
      filePath: "last-message",
      mode: "annotate-last",
      htmlContent: MINIMAL_HTML,
      recentMessages,
      selectedMessageId: "shown",
    });
    try {
      const data = await (await fetch(`${server.url}/api/document`)).json() as { selectedMessageId?: string };
      expect(data.selectedMessageId).toBe("shown");
    } finally {
      server.stop();
    }
  });

  test("a draft keyed on draftId survives a new newest message", async () => {
    const start = (markdown: string) => startAnnotateServer({
      markdown,
      filePath: "last-message",
      mode: "annotate-last",
      htmlContent: MINIMAL_HTML,
      draftId: "/logs/session.jsonl",
    });
    const draft = { annotations: [], messages: { shown: { annotations: [{ id: "a1" }], globalAttachments: [] } }, draftGeneration: 1, ts: 1 };

    const first = await start("# A longer message");
    try {
      await fetch(`${first.url}/api/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    } finally {
      first.stop();
    }

    const second = await start("# A newer message");
    try {
      const loaded = await (await fetch(`${second.url}/api/draft`)).json() as typeof draft;
      expect(loaded.messages.shown.annotations).toEqual([{ id: "a1" }]);
    } finally {
      second.stop();
    }
  });
});
