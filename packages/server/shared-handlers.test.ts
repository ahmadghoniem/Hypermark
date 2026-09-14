import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  handleFavicon,
  handleServerReady,
  isCodexDesktopHost,
  writeServerReadyMetadata,
} from "./shared-handlers";
import { CLASSIC_FAVICON_SVG } from "@hypermark/shared/favicon";



describe("writeServerReadyMetadata", () => {
  test("writes host-plugin ready metadata", () => {
    const dir = mkdtempSync(join(tmpdir(), "hypermark-ready-"));
    const readyFile = join(dir, "nested", "ready.jsonl");

    try {
      writeServerReadyMetadata(readyFile, {
        url: "http://localhost:12345",
        port: 12345,
      });
      const [line] = readFileSync(readyFile, "utf8").trim().split(/\r?\n/);
      expect(JSON.parse(line)).toEqual({
        url: "http://localhost:12345",
        port: 12345,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("handleServerReady", () => {
  test("detects the Codex Desktop app host", () => {
    expect(isCodexDesktopHost({ __CFBundleIdentifier: "com.openai.codex" })).toBe(true);
    expect(isCodexDesktopHost({ __CFBundleIdentifier: "com.apple.Terminal" })).toBe(false);
  });

  test("does not open a browser when host-plugin mode handles it", async () => {
    let opened = false;
    const originalBundleIdentifier = process.env.__CFBundleIdentifier;
    process.env.__CFBundleIdentifier = "com.apple.Terminal";

    try {
      await handleServerReady("http://localhost:12345", 12345, {
        skipBrowserOpen: true,
        openBrowser: async () => {
          opened = true;
        },
      });
    } finally {
      if (originalBundleIdentifier === undefined) {
        delete process.env.__CFBundleIdentifier;
      } else {
        process.env.__CFBundleIdentifier = originalBundleIdentifier;
      }
    }

    expect(opened).toBe(false);
  });


  test("does not print the URL for a local session when the browser opens", async () => {
    const writes: string[] = [];
    let opened = "";
    const original = process.stderr.write.bind(process.stderr);
    const originalBundleIdentifier = process.env.__CFBundleIdentifier;
    (process.stderr as { write: unknown }).write = (chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    };
    process.env.__CFBundleIdentifier = "com.apple.Terminal";
    try {
      await handleServerReady("http://localhost:3000", 3000, {
        openBrowser: async (u: string) => {
          opened = u;
          return true;
        },
      });
    } finally {
      (process.stderr as { write: unknown }).write = original;
      if (originalBundleIdentifier === undefined) {
        delete process.env.__CFBundleIdentifier;
      } else {
        process.env.__CFBundleIdentifier = originalBundleIdentifier;
      }
    }
    expect(writes.join("")).not.toContain("http://localhost:3000");
    expect(opened).toBe("http://localhost:3000");
  });

  test("prints the URL for a local Codex Desktop session even when the browser opens", async () => {
    const writes: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    const originalBundleIdentifier = process.env.__CFBundleIdentifier;
    (process.stderr as { write: unknown }).write = (chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    };
    process.env.__CFBundleIdentifier = "com.openai.codex";
    try {
      await handleServerReady("http://localhost:3000", 3000, {
        openBrowser: async () => true,
      });
    } finally {
      (process.stderr as { write: unknown }).write = originalWrite;
      if (originalBundleIdentifier === undefined) {
        delete process.env.__CFBundleIdentifier;
      } else {
        process.env.__CFBundleIdentifier = originalBundleIdentifier;
      }
    }
    expect(writes.join("")).toContain("http://localhost:3000");
  });

  // Regression: a local session whose browser can't be opened (headless box,
  // devcontainer with no display) must still surface the URL, or the agent
  // hangs at waitForDecision with the user having no link to visit.
  test("prints the URL for a local session when the browser fails to open", async () => {
    const writes: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    (process.stderr as { write: unknown }).write = (chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    };
    try {
      await handleServerReady("http://localhost:4000", 4000, {
        openBrowser: async () => false,
      });
    } finally {
      (process.stderr as { write: unknown }).write = original;
    }
    expect(writes.join("")).toContain("http://localhost:4000");
  });
});

/**
 * Deliberately a unit test on the handler rather than an HTTP round trip: this
 * file never calls global fetch, so it stays correct in either CI lane. The DOM
 * lanes in .github/workflows/test.yml list individual files and include no
 * server tests, but a server test that booted a server and fetched it would
 * break the moment someone added one (happy-dom replaces global fetch).
 */
describe("handleFavicon", () => {
  test("serves the classic SVG, correctly typed", async () => {
    const response = handleFavicon();
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(await response.text()).toBe(CLASSIC_FAVICON_SVG);
  });

  test("does not let the payload be cached under the shared URL", () => {
    expect(handleFavicon().headers.get("cache-control")).toBe("no-cache");
  });
});
