import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLASSIC_FAVICON_SVG } from "../core/favicon";
import { saveConfig } from "./config";
// Use a distinct module key so unrelated mock.module() tests cannot replace
// the real server.
import { startAnnotateServer as startBunAnnotateServer } from "./annotate.ts?api-404-guard";
import { startHypermarkServer as startBunPlanServer } from "./index";
import { startReviewServer as startBunReviewServer } from "./review";

const SPA_HTML = "<!doctype html><html><body>SPA fallback</body></html>";
let archivePath = "";
let dataDirPath = "";
let savedDataDir: string | undefined;

interface RunningServer {
  readonly url: string;
  stop(): void;
}

interface ServerCase {
  readonly name: string;
  readonly knownApiPath: string;
  readonly start: () => Promise<RunningServer>;
}

const serverCases = [
  {
    name: "Bun plan",
    knownApiPath: "/api/plan",
    start: () =>
      startBunPlanServer({
        plan: "# Test Plan",
        origin: "claude-code",
        htmlContent: SPA_HTML,
        mode: "archive",
        customPlanPath: archivePath,
      }),
  },
  {
    name: "Bun review",
    knownApiPath: "/api/diff",
    start: () =>
      startBunReviewServer({
        rawPatch: "",
        gitRef: "HEAD",
        origin: "claude-code",
        htmlContent: SPA_HTML,
      }),
  },
  {
    name: "Bun annotate",
    knownApiPath: "/api/plan",
    start: () =>
      startBunAnnotateServer({
        markdown: "# Test Document",
        filePath: "test.md",
        origin: "claude-code",
        htmlContent: SPA_HTML,
      }),
  },
] as const;

// The archive-mode subset of the servers above. Restored: spec 01 removed the
// Pi entry and took the whole list with it, leaving the loop below referencing
// an undefined name, which made this entire file fail to load.
const archiveServerCases = [
  {
    name: "Bun plan",
    start: () =>
      startBunPlanServer({
        plan: "# Test Plan",
        origin: "claude-code",
        htmlContent: SPA_HTML,
        mode: "archive",
        customPlanPath: archivePath,
      }),
  },
] as const;

const archiveMutationRequests = [
  { path: "/api/approve", method: "POST" },
  { path: "/api/deny", method: "POST" },
  { path: "/api/draft", method: "POST" },
  { path: "/api/draft", method: "DELETE" },
  { path: "/api/save-notes", method: "POST" },
  { path: "/api/upload", method: "POST" },
] as const;

async function expectJsonNotFound(
  server: RunningServer,
  requestPath: string,
): Promise<void> {
  const response = await fetch(`${server.url}${requestPath}`);
  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual({
    error: "Not found",
    path: new URL(requestPath, server.url).pathname,
  });
}

async function startOnRandomLocalPort(
  start: () => Promise<RunningServer>,
): Promise<RunningServer> {
  const previousPort = process.env.HYPERMARK_PORT;
  delete process.env.HYPERMARK_PORT;

  try {
    return await start();
  } finally {
    if (previousPort === undefined) {
      delete process.env.HYPERMARK_PORT;
    } else {
      process.env.HYPERMARK_PORT = previousPort;
    }
  }
}

describe("API route 404 guards", () => {
  beforeAll(() => {
    archivePath = mkdtempSync(join(tmpdir(), "hypermark-api-404-"));
    // /favicon.png now answers from the persisted favicon style, so this suite
    // reads config.json. Point it at a temp dir: it must never depend on (or
    // touch) the real ~/.hypermark of whoever runs the tests.
    dataDirPath = mkdtempSync(join(tmpdir(), "hypermark-api-404-data-"));
    savedDataDir = process.env.HYPERMARK_DATA_DIR;
    process.env.HYPERMARK_DATA_DIR = dataDirPath;
  });

  afterAll(() => {
    rmSync(archivePath, { recursive: true, force: true });
    if (savedDataDir === undefined) delete process.env.HYPERMARK_DATA_DIR;
    else process.env.HYPERMARK_DATA_DIR = savedDataDir;
    rmSync(dataDirPath, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(join(dataDirPath, "config.json"), { force: true });
  });

  for (const serverCase of serverCases) {
    test(`${serverCase.name} returns JSON 404 without breaking API or SPA routes`, async () => {
      const server = await startOnRandomLocalPort(serverCase.start);

      try {
        expect(server.url).toMatch(/^http:\/\/localhost:\d+$/);
        await expectJsonNotFound(
          server,
          "/api/nonexistent-route?ignored=query",
        );

        const knownApiResponse = await fetch(
          `${server.url}${serverCase.knownApiPath}`,
        );
        expect(knownApiResponse.status).toBe(200);
        expect(knownApiResponse.headers.get("content-type")).toContain(
          "application/json",
        );


        const faviconResponse = await fetch(`${server.url}/favicon.png`);
        expect(faviconResponse.status).toBe(200);
        expect(faviconResponse.headers.get("content-type")).toBe("image/svg+xml");
        expect(faviconResponse.headers.get("cache-control")).toBe("no-cache");
        expect(await faviconResponse.text()).toBe(CLASSIC_FAVICON_SVG);

        const spaResponse = await fetch(`${server.url}/some/random/path`);
        expect(spaResponse.status).toBe(200);
        expect(spaResponse.headers.get("content-type")).toContain("text/html");
        expect(await spaResponse.text()).toBe(SPA_HTML);
      } finally {
        server.stop();
      }
    });
  }

  for (const serverCase of archiveServerCases) {
    test(`${serverCase.name} rejects document mutations in archive mode`, async () => {
      const server = await startOnRandomLocalPort(serverCase.start);

      try {
        for (const request of archiveMutationRequests) {
          const response = await fetch(`${server.url}${request.path}`, {
            method: request.method,
          });
          expect(response.status).toBe(403);
          expect(await response.json()).toEqual({ error: "Archive is read-only" });
        }
      } finally {
        server.stop();
      }
    });
  }
});
