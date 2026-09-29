import { afterEach, describe, expect, test } from "bun:test";
import { isNoOpBrowserSentinel } from "./browser";

const savedEnv: Record<string, string | undefined> = {};
const envKeys = ["HYPERMARK_BROWSER", "BROWSER"];

function clearEnv() {
  for (const key of envKeys) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
}

afterEach(() => {
  for (const key of envKeys) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
});


describe("isNoOpBrowserSentinel", () => {
  test("returns false for undefined and empty values", () => {
    expect(isNoOpBrowserSentinel(undefined)).toBe(false);
    expect(isNoOpBrowserSentinel("")).toBe(false);
  });

  test("recognizes no-op values case- and whitespace-insensitively", () => {
    for (const value of [
      "true",
      "false",
      "none",
      ":",
      "0",
      "1",
      "TRUE",
      "  none  ",
    ]) {
      expect(isNoOpBrowserSentinel(value)).toBe(true);
    }
  });

  test("does not flag real browser handlers or explicit command paths", () => {
    expect(isNoOpBrowserSentinel("/usr/bin/firefox")).toBe(false);
    expect(isNoOpBrowserSentinel("Google Chrome")).toBe(false);
    expect(isNoOpBrowserSentinel("open")).toBe(false);
    expect(isNoOpBrowserSentinel("/usr/bin/true")).toBe(false);
  });
});
