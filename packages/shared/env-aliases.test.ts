/**
 * Spec 06 — the PLANNOTATOR_* -> HYPERMARK_* alias contract.
 *
 * The precedence rule lives in one module precisely so it can be pinned here
 * rather than re-argued at each of the call sites that read a variable.
 */
import { describe, expect, test } from "bun:test";
import {
  applyLegacyEnvAliases,
  legacyEnvAliasNotice,
  type EnvLike,
} from "./env-aliases";

describe("applyLegacyEnvAliases", () => {
  test("a legacy variable fills in the current name", () => {
    const env: EnvLike = { PLANNOTATOR_DATA_DIR: "/tmp/data" };

    const applied = applyLegacyEnvAliases(env);

    expect(env.HYPERMARK_DATA_DIR).toBe("/tmp/data");
    expect(applied).toEqual(["HYPERMARK_DATA_DIR"]);
  });

  test("the current name wins when both are set", () => {
    const env: EnvLike = {
      HYPERMARK_DATA_DIR: "/tmp/new",
      PLANNOTATOR_DATA_DIR: "/tmp/old",
    };

    const applied = applyLegacyEnvAliases(env);

    expect(env.HYPERMARK_DATA_DIR).toBe("/tmp/new");
    expect(applied).toEqual([]);
  });

  test("a set-but-EMPTY current name suppresses the legacy one", () => {
    // The case the rule exists for: `HYPERMARK_DATA_DIR= hypermark ...` must
    // not quietly inherit a stale PLANNOTATOR_DATA_DIR from a shell profile.
    const env: EnvLike = {
      HYPERMARK_DATA_DIR: "",
      PLANNOTATOR_DATA_DIR: "/tmp/old",
    };

    applyLegacyEnvAliases(env);

    expect(env.HYPERMARK_DATA_DIR).toBe("");
  });

  test("an empty legacy value is copied, keeping its suppressing meaning", () => {
    const env: EnvLike = { PLANNOTATOR_REMOTE: "" };

    applyLegacyEnvAliases(env);

    expect(env.HYPERMARK_REMOTE).toBe("");
  });

  test("the legacy variable is left in place for child processes", () => {
    const env: EnvLike = { PLANNOTATOR_PORT: "4321" };

    applyLegacyEnvAliases(env);

    expect(env.PLANNOTATOR_PORT).toBe("4321");
    expect(env.HYPERMARK_PORT).toBe("4321");
  });

  test("aliasing works on the prefix, so a new variable needs no registration", () => {
    const env: EnvLike = { PLANNOTATOR_SOMETHING_INVENTED_LATER: "yes" };

    applyLegacyEnvAliases(env);

    expect(env.HYPERMARK_SOMETHING_INVENTED_LATER).toBe("yes");
  });

  test("unrelated variables are untouched", () => {
    const env: EnvLike = { PATH: "/usr/bin", XDG_DATA_HOME: "/xdg" };

    const applied = applyLegacyEnvAliases(env);

    expect(applied).toEqual([]);
    expect(Object.keys(env).sort()).toEqual(["PATH", "XDG_DATA_HOME"]);
  });

  test("a second call is a no-op", () => {
    const env: EnvLike = { PLANNOTATOR_DEBUG: "1" };

    expect(applyLegacyEnvAliases(env)).toEqual(["HYPERMARK_DEBUG"]);
    expect(applyLegacyEnvAliases(env)).toEqual([]);
    expect(env.HYPERMARK_DEBUG).toBe("1");
  });

  test("several legacy variables are all aliased", () => {
    const env: EnvLike = {
      PLANNOTATOR_PORT: "1",
      PLANNOTATOR_REMOTE: "1",
      HYPERMARK_DEBUG: "keep",
      PLANNOTATOR_DEBUG: "ignored",
    };

    const applied = applyLegacyEnvAliases(env);

    expect(applied).toEqual(["HYPERMARK_PORT", "HYPERMARK_REMOTE"]);
    expect(env.HYPERMARK_DEBUG).toBe("keep");
  });
});

describe("legacyEnvAliasNotice", () => {
  test("names the deprecated variables the user actually set", () => {
    const notice = legacyEnvAliasNotice(["HYPERMARK_DATA_DIR"]);

    expect(notice).toContain("PLANNOTATOR_DATA_DIR");
    expect(notice).toContain("HYPERMARK_DATA_DIR");
    expect(notice).toContain("deprecated");
  });

  test("is silent when nothing was aliased", () => {
    expect(legacyEnvAliasNotice([])).toBeNull();
  });
});
