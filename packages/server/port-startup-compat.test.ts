import { afterEach, describe, expect, test } from "bun:test";
import { createTestEnvironment } from "../../tests/helpers/environment";
import { closeServer, occupyConsecutivePorts } from "../../tests/helpers/ports";
import { startHypermarkServer } from "./index";
import { handleServerReady } from "./shared-handlers";

const envKeys = [
  "HYPERMARK_PORT",
  "HYPERMARK_DATA_DIR",
  "HYPERMARK_SKIP_BROWSER_OPEN",
  "__CFBundleIdentifier",
] as const;
const environment = createTestEnvironment(envKeys, "hypermark-port-compat-");

afterEach(() => environment.restore());

describe("Bun startup port compatibility", () => {
  test("unset local startup keeps its random URL and browser-ready handoff", async () => {
    environment.reset();
    process.env.HYPERMARK_DATA_DIR = environment.makeTempDir();
    process.env.__CFBundleIdentifier = "com.apple.Terminal";
    let ready: { url: string; port: number } | undefined;

    const server = await startHypermarkServer({
      plan: "# Port compatibility",
      origin: "codex",
      htmlContent: "<!doctype html><html><body>plan</body></html>",
      onReady: (url, port) => {
        ready = { url, port };
      },
    });

    try {
      expect(server.port).toBeGreaterThan(0);
      expect(server.url).toBe(`http://localhost:${server.port}`);
      expect(ready).toEqual({ url: server.url, port: server.port });

      let openedUrl: string | undefined;
      await handleServerReady(server.url, server.port, {
        openBrowser: async (url) => {
          openedUrl = url;
          return true;
        },
      });
      expect(openedUrl).toBe(server.url);
    } finally {
      await server.stop();
    }
  });

  test("a fixed numeric port keeps the same ready URL", async () => {
    environment.reset();
    const { start, servers } = await occupyConsecutivePorts(1);
    await closeServer(servers[0]);
    process.env.HYPERMARK_PORT = String(start);
    process.env.HYPERMARK_DATA_DIR = environment.makeTempDir();
    let ready: { url: string; port: number } | undefined;

    const server = await startHypermarkServer({
      plan: "# Fixed port compatibility",
      origin: "codex",
      htmlContent: "<!doctype html><html><body>plan</body></html>",
      onReady: (url, port) => {
        ready = { url, port };
      },
    });

    try {
      expect(server.port).toBe(start);
      expect(server.url).toBe(`http://localhost:${start}`);
      expect(ready).toEqual({ url: server.url, port: start });
    } finally {
      await server.stop();
    }
  });

  test("an async ready failure releases the fixed port before startup rejects", async () => {
    environment.reset();
    const { start, servers } = await occupyConsecutivePorts(1);
    await closeServer(servers[0]);
    process.env.HYPERMARK_PORT = String(start);
    process.env.HYPERMARK_DATA_DIR = environment.makeTempDir();
    const readyError = new Error("ready handoff failed");

    await expect(startHypermarkServer({
      plan: "# Ready failure cleanup",
      origin: "codex",
      htmlContent: "<!doctype html><html><body>plan</body></html>",
      onReady: async () => {
        await Promise.resolve();
        throw readyError;
      },
    })).rejects.toBe(readyError);

    const replacement = Bun.serve({
      hostname: "127.0.0.1",
      port: start,
      fetch: () => new Response("reused"),
    });
    await replacement.stop(true);
  });
});
