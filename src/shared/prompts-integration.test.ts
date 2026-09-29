/**
 * Integration tests for the prompt pipeline.
 *
 * Each test writes a real ~/.hypermark/config.json (in a temp HOME),
 * then calls prompt functions WITHOUT passing a config parameter —
 * forcing loadConfig() to read from disk. This proves the full path:
 *   config.json on disk → loadConfig() → getConfiguredPrompt() → output
 *
 * Uses subprocess isolation for clean environment testing.
 *
 * Run: bun test src/shared/prompts-integration.test.ts
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_HOME = join(tmpdir(), `prompts-integration-test-${Date.now()}`);
const CONFIG_DIR = join(TEST_HOME, ".hypermark");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const PROJECT_ROOT = join(import.meta.dir, "../..");

function writeConfig(config: Record<string, unknown>) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function cleanTestHome() {
  if (existsSync(TEST_HOME)) {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
}

async function runScript(script: string): Promise<string> {
  const proc = Bun.spawn(["bun", "-e", script], {
    env: { ...process.env, HOME: TEST_HOME, USERPROFILE: TEST_HOME },
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Subprocess failed (exit ${exitCode}): ${stderr}`);
  }

  return stdout.trim();
}

describe("prompts integration (config from disk)", () => {
  beforeEach(() => {
    cleanTestHome();
    mkdirSync(CONFIG_DIR, { recursive: true });
  });
  afterEach(cleanTestHome);

  // ── Review denied suffix ─────────────────────────────────────────────

  test("review denied suffix reads override from config.json", async () => {
    writeConfig({
      prompts: { review: { denied: "\n\nFix everything now." } },
    });

    const result = await runScript(`
      import { getReviewDeniedSuffix } from "./src/shared/prompts";
      console.log(JSON.stringify(getReviewDeniedSuffix("claude-code")));
    `);

    expect(JSON.parse(result)).toBe("\n\nFix everything now.");
  });

  // ── Cross-section isolation ──────────────────────────────────────────

  test("config sections don't bleed into each other", async () => {
    writeConfig({
      prompts: {
        review: { denied: "Custom review denial: {{feedback}}" },
        annotate: { fileFeedback: "Custom file feedback: {{feedback}}" },
      },
    });

    // Review denied should use custom
    const reviewDenied = await runScript(`
      import { getReviewDeniedSuffix } from "./src/shared/prompts";
      console.log(getReviewDeniedSuffix("claude-code"));
    `);
    expect(reviewDenied).toBe("Custom review denial: {{feedback}}");

    // Annotate file feedback should use custom
    const fileFeedback = await runScript(`
      import { getAnnotateFileFeedbackTemplate } from "./src/shared/prompts";
      console.log(getAnnotateFileFeedbackTemplate("claude-code"));
    `);
    expect(fileFeedback).toBe("Custom file feedback: {{feedback}}");

    // Annotate message feedback should still be the default (not set in config)
    const messageFeedback = await runScript(`
      import { getAnnotateMessageFeedbackTemplate } from "./src/shared/prompts";
      console.log(getAnnotateMessageFeedbackTemplate("claude-code"));
    `);
    expect(messageFeedback).toContain("# Message Annotations");
  });

  // ── Malformed config resilience ──────────────────────────────────────

  test("malformed config.json falls back to defaults gracefully", async () => {
    writeFileSync(CONFIG_PATH, "not valid json {{{");

    const result = await runScript(`
      import { DEFAULT_REVIEW_DENIED_SUFFIX, getReviewDeniedSuffix } from "./src/shared/prompts";
      console.log(getReviewDeniedSuffix("claude-code") === DEFAULT_REVIEW_DENIED_SUFFIX);
    `);

    expect(result).toBe("true");
  });
});
