import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Bun resolves homedir() from the environment captured at process start, so
// mutating process.env.HOME inside this test process has no effect. Each case
// therefore runs the resolver in a subprocess with a fully controlled
// environment (fake HOME, explicit HYPERMARK_DATA_DIR / XDG_DATA_HOME).
const MODULE_PATH = join(import.meta.dir, "data-dir.ts");

let fakeHome = "";

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "hypermark-data-dir-home-"));
});

afterEach(() => {
  rmSync(fakeHome, { recursive: true, force: true });
});

function resolveDataDir(env: Record<string, string>): string {
  const script = `console.log(require(${JSON.stringify(MODULE_PATH)}).getHypermarkDataDir());`;
  const result = Bun.spawnSync({
    cmd: [process.execPath, "-e", script],
    env: {
      PATH: process.env.PATH ?? "",
      HOME: fakeHome,
      // Windows resolves homedir() from USERPROFILE, not HOME.
      USERPROFILE: fakeHome,
      ...env,
    },
  });
  if (result.exitCode !== 0) {
    throw new Error(`resolver subprocess failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

describe("getHypermarkDataDir", () => {
  test("HYPERMARK_DATA_DIR wins over an existing root and XDG_DATA_HOME", () => {
    mkdirSync(join(fakeHome, ".hypermark"));

    const dir = resolveDataDir({
      HYPERMARK_DATA_DIR: join(fakeHome, "custom-data"),
      XDG_DATA_HOME: join(fakeHome, "xdg-data"),
    });

    expect(dir).toBe(join(fakeHome, "custom-data"));
  });

  test("HYPERMARK_DATA_DIR expands a leading ~", () => {
    const dir = resolveDataDir({ HYPERMARK_DATA_DIR: "~/relocated" });

    expect(dir).toBe(join(fakeHome, "relocated"));
  });

  test("an existing ~/.hypermark wins over XDG_DATA_HOME", () => {
    mkdirSync(join(fakeHome, ".hypermark"));

    const dir = resolveDataDir({ XDG_DATA_HOME: join(fakeHome, "xdg-data") });

    expect(dir).toBe(join(fakeHome, ".hypermark"));
  });

  test("XDG_DATA_HOME applies when set and ~/.hypermark does not exist", () => {
    const dir = resolveDataDir({ XDG_DATA_HOME: join(fakeHome, "xdg-data") });

    expect(dir).toBe(join(fakeHome, "xdg-data", "hypermark"));
  });

  test("a relative XDG_DATA_HOME is ignored", () => {
    const dir = resolveDataDir({ XDG_DATA_HOME: "relative/xdg-data" });

    expect(dir).toBe(join(fakeHome, ".hypermark"));
  });

  test("an empty XDG_DATA_HOME is ignored", () => {
    const dir = resolveDataDir({ XDG_DATA_HOME: "  " });

    expect(dir).toBe(join(fakeHome, ".hypermark"));
  });

  test("defaults to ~/.hypermark when nothing is set", () => {
    const dir = resolveDataDir({});

    expect(dir).toBe(join(fakeHome, ".hypermark"));
  });

  /**
   * Spec 06 decision D5: a fresh root, no import, no merge. An existing
   * Plannotator directory must not attract a single read — the whole promise
   * of "your old data is untouched" rests on this resolver never naming it.
   */
  test("an existing ~/.plannotator is ignored entirely", () => {
    mkdirSync(join(fakeHome, ".plannotator"));

    const dir = resolveDataDir({});

    expect(dir).toBe(join(fakeHome, ".hypermark"));
  });

  test("PLANNOTATOR_DATA_DIR is not read by the resolver itself", () => {
    // The legacy name is honoured by the env-alias shim at process start, not
    // here. A resolver that also read it would apply the precedence rule twice
    // and disagree with itself on the set-but-empty case.
    const dir = resolveDataDir({
      PLANNOTATOR_DATA_DIR: join(fakeHome, "legacy-data"),
    });

    expect(dir).toBe(join(fakeHome, ".hypermark"));
  });

  test("the alias shim makes PLANNOTATOR_DATA_DIR work end to end", () => {
    const script = [
      `require(${JSON.stringify(join(import.meta.dir, "env-aliases-apply.ts"))});`,
      `console.log(require(${JSON.stringify(MODULE_PATH)}).getHypermarkDataDir());`,
    ].join("\n");
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        PLANNOTATOR_DATA_DIR: join(fakeHome, "legacy-data"),
      },
    });

    expect(result.stdout.toString().trim()).toBe(join(fakeHome, "legacy-data"));
  });
});
