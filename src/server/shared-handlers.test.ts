import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  handleFavicon,
  handleServerReady,
  removeUnsentUploads,
} from "./shared-handlers";
import { CLASSIC_FAVICON_SVG } from "@/shared/favicon";



describe("handleServerReady", () => {
  test("does not open a browser when skipBrowserOpen is set", async () => {
    let opened = false;

    await handleServerReady("http://localhost:12345", 12345, {
      skipBrowserOpen: true,
      openBrowser: async () => {
        opened = true;
      },
    });

    expect(opened).toBe(false);
  });

  test("does not print the URL for a local session when the browser opens", async () => {
    const writes: string[] = [];
    let opened = "";
    const original = process.stderr.write.bind(process.stderr);
    (process.stderr as { write: unknown }).write = (chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    };
    try {
      await handleServerReady("http://localhost:3000", 3000, {
        openBrowser: async (u: string) => {
          opened = u;
          return true;
        },
      });
    } finally {
      (process.stderr as { write: unknown }).write = original;
    }
    expect(writes.join("")).not.toContain("http://localhost:3000");
    expect(opened).toBe("http://localhost:3000");
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
 * file never calls global fetch, so it stays correct when happy-dom (which
 * replaces global fetch) is loaded in the same run.
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

describe("removeUnsentUploads", () => {
  test("keeps the uploads the feedback mentions and deletes the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-uploads-"));
    try {
      const sent = join(dir, "sent.png");
      const unsent = join(dir, "unsent.png");
      writeFileSync(sent, "");
      writeFileSync(unsent, "");
      removeUnsentUploads([sent, unsent], `see [image-1] ${dir}/sent.png`);
      expect(existsSync(sent)).toBe(true);
      expect(existsSync(unsent)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
