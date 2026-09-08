/**
 * Contract guard for the EXECUTING Claude launcher templates
 * (apps/skills/claude/*), plus the installer wiring that puts them on disk.
 *
 * Why this file exists: `apps/skills/claude` and `apps/skills/core` hold
 * same-named skills with deliberately different bodies. The claude/ copies are
 * the launcher source of truth — Claude Code's dynamic-context injection
 * (a leading `!` line) runs `plannotator ...` BEFORE the model sees the
 * prompt, and `allowed-tools` keeps that run out of the permission prompt.
 * The core/ copies are prose the model follows with its own shell. Swapping
 * one for the other silently turns /hypermark-review into "the model might
 * decide to run something", which is not the same product. Nothing else in
 * the suite asserts the claude/ frontmatter: scripts/install.test.ts scans
 * only the core/ and extra/ roots.
 *
 * This file lives at the apps/skills/claude ROOT, not inside a skill folder,
 * so the installers (which copy named skill directories) never ship it.
 */

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLAUDE_DIR = import.meta.dir;
const REPO_ROOT = join(CLAUDE_DIR, "..", "..", "..");
const CORE_DIR = join(REPO_ROOT, "apps", "skills", "core");

/**
 * The three executing launchers and the exact CLI invocation each one
 * injects. All three carry the `hypermark-` name as of spec 06 step 2; a
 * rename that touches only some of them fails here.
 */
const LAUNCHERS = [
  { skill: "hypermark-annotate", command: "annotate" },
  { skill: "hypermark-last", command: "annotate-last" },
  { skill: "hypermark-review", command: "review" },
] as const;

function readSkill(root: string, skill: string): string {
  return readFileSync(join(root, skill, "SKILL.md"), "utf-8").replace(
    /\r\n?/g,
    "\n",
  );
}

function frontmatterOf(doc: string): string {
  return doc.split("---")[1] ?? "";
}

function readInstaller(name: string): string {
  return readFileSync(join(REPO_ROOT, "scripts", name), "utf-8").replace(
    /\r\n?/g,
    "\n",
  );
}

describe("Claude launcher templates (apps/skills/claude)", () => {
  test("every launcher is user-invoked only and named for its directory", () => {
    for (const { skill } of LAUNCHERS) {
      const doc = readSkill(CLAUDE_DIR, skill);
      const frontmatter = frontmatterOf(doc);
      expect(frontmatter, skill).toContain("disable-model-invocation: true");
      expect(frontmatter, skill).toContain(`name: ${skill}`);
      // Spec 06 step 2 renamed the launchers. The guard now runs the other
      // way: no launcher may keep, or reintroduce, an old `plannotator-`
      // command name. The bare `plannotator` binary is a separate rename and
      // is asserted by the two tests below, so match on the hyphen.
      expect(skill.startsWith("hypermark-"), skill).toBe(true);
      expect(doc, skill).not.toContain("plannotator-");
    }
  });

  test("every launcher pre-allows the plannotator CLI via allowed-tools", () => {
    // Without this the injected command would raise a permission prompt on
    // every /plannotator-* invocation, which is exactly what the old slash
    // commands avoided.
    for (const { skill } of LAUNCHERS) {
      expect(frontmatterOf(readSkill(CLAUDE_DIR, skill)), skill).toContain(
        "allowed-tools: Bash(plannotator:*)",
      );
    }
  });

  test("every launcher injects its command with $ARGUMENTS before the prompt", () => {
    for (const { skill, command } of LAUNCHERS) {
      const doc = readSkill(CLAUDE_DIR, skill);
      const injection = "!`plannotator " + command + " $ARGUMENTS`";
      expect(doc, skill).toContain(injection);

      // The substitution must be its own line: Claude Code only executes a
      // `!`...`` span, and only what it substitutes reaches the model.
      const injectionLine = doc
        .split("\n")
        .find((line) => line.trim() === injection);
      expect(injectionLine, `${skill}: injection must be on its own line`)
        .toBeDefined();

      // ... and it must precede the instructions that interpret its output,
      // which is what "runs before the model sees the prompt" means here.
      const taskIdx = doc.indexOf("## Your task");
      expect(taskIdx, skill).toBeGreaterThan(0);
      expect(doc.indexOf(injection), skill).toBeLessThan(taskIdx);
    }
  });

  test("the core/ prose variants are NOT interchangeable with the launchers", () => {
    // Regression guard for the spec-02 rule: a cleanup that "deduplicates"
    // the two roots would drop the injection and the allowlist.
    for (const { skill } of LAUNCHERS) {
      const core = readSkill(CORE_DIR, skill);
      expect(frontmatterOf(core), skill).not.toContain("allowed-tools");
      expect(core, skill).not.toContain("$ARGUMENTS");
      expect(core, skill).not.toContain("!`plannotator");
      // Both roots agree on the one thing they must: never model-invoked.
      expect(frontmatterOf(core), skill).toContain(
        "disable-model-invocation: true",
      );
    }
  });

  test("launchers carry no reference to features specs 01/02 removed", () => {
    // Guided Review, Code Tours, Workspaces, Vim, and `plannotator guide`.
    const banned =
      /\bguided review\b|\bcode tours?\b|\bplannotator guide\b|\bworkspaces\b|\bvim\b/i;
    for (const { skill } of LAUNCHERS) {
      expect(readSkill(CLAUDE_DIR, skill), skill).not.toMatch(banned);
    }
  });
});

describe("installers source the Claude scope from apps/skills/claude", () => {
  const ps1 = readInstaller("install.ps1");
  const cmd = readInstaller("install.cmd");

  test("install.ps1 copies the executing launchers, not the prose variants", () => {
    expect(ps1).toContain(
      `foreach ($skill in @("hypermark-review", "hypermark-annotate", "hypermark-last")) {`,
    );
    expect(ps1).toContain(
      'Copy-SkillIfPresent "apps\\skills\\claude\\$skill" $claudeSkillsDir',
    );
    // The knowledge/CLI-reference skill has no injection form, so the Claude
    // scope gets the single-sourced core copy. Its owner is core/plannotator,
    // which apps/hook/server/plannotator-skill-reference.test.ts keeps fresh.
    expect(ps1).toContain(
      'Copy-SkillIfPresent "apps\\skills\\core\\plannotator" $claudeSkillsDir',
    );
    // ... and never the prose launcher bodies.
    expect(ps1).not.toContain(
      'Copy-SkillIfPresent "apps\\skills\\core\\$skill" $claudeSkillsDir',
    );
  });

  test("install.cmd copies the executing launchers, not the prose variants", () => {
    expect(cmd).toContain(
      "for %%S in (hypermark-review hypermark-annotate hypermark-last) do",
    );
    expect(cmd).toContain(
      'xcopy /s /i /y /q "apps\\skills\\claude\\%%S" "!CLAUDE_SKILLS_DIR!\\%%S\\"',
    );
    expect(cmd).toContain(
      'xcopy /s /i /y /q "apps\\skills\\core\\plannotator" "!CLAUDE_SKILLS_DIR!\\plannotator\\"',
    );
    expect(cmd).not.toContain(
      'xcopy /s /i /y /q "apps\\skills\\core\\%%S" "!CLAUDE_SKILLS_DIR!\\%%S\\"',
    );
  });

  test("neither installer references an agent root spec 01 deleted", () => {
    // #1: the sparse checkout must not ask for paths that no longer exist —
    // git errors on an unknown sparse path and the skills install dies with it.
    const removed =
      /codex|gemini|kiro|opencode|pi-extension|amp-plugin|droid|copilot|vscode-extension|guides-show|waitlist|paste-service/i;
    for (const [name, script] of [
      ["install.ps1", ps1],
      ["install.cmd", cmd],
    ] as const) {
      expect(script, name).not.toMatch(removed);
    }
    expect(ps1).toContain("git sparse-checkout set apps/skills 2>$null");
    expect(cmd).toContain("git sparse-checkout set apps/skills >nul 2>&1");
  });

  test("install.cmd's block structure is balanced", () => {
    // Spec 01 removed the OpenCode/Gemini/Kiro copy blocks and left their
    // closing `)` lines behind, which closed `if "!CLONE_OK!"=="1" (` early
    // and made every following `)` a cmd.exe syntax error. cmd has no linter,
    // so count depth over the non-comment lines with carets and quoted spans
    // removed.
    let depth = 0;
    const negatives: string[] = [];
    cmd.split("\n").forEach((raw, i) => {
      if (/^\s*(REM\b|::)/i.test(raw)) return;
      for (const ch of raw.replace(/\^./g, "").replace(/"[^"]*"/g, '""')) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (depth < 0) {
          negatives.push(`${i + 1}: ${raw.trim()}`);
          depth = 0;
        }
      }
    });
    expect(negatives, "unmatched ) in install.cmd").toEqual([]);
    expect(depth, "unclosed ( in install.cmd").toBe(0);
  });

  test("both installers stay free of stray control characters", () => {
    // A spec-01 sweep turned `apps\skills\core` into `appsskills\x0Fre` (a
    // `\c` escape eaten by whatever rewrote the file). install.cmd's ASCII
    // guard passes 0x0F happily, so check the printable range explicitly.
    for (const [name, script] of [
      ["install.ps1", ps1],
      ["install.cmd", cmd],
    ] as const) {
      const bad = [...script].filter((c) => {
        const n = c.charCodeAt(0);
        return n !== 9 && n !== 10 && (n < 32 || n === 127);
      });
      expect(bad.map((c) => c.charCodeAt(0)), name).toEqual([]);
    }
  });
});

/**
 * Spaced/Unicode install paths.
 *
 * This repo lives under `C:\Users\Ahmed Ibrahim\...`; the space is real. The
 * install targets (`$env:USERPROFILE\.claude\skills`) inherit it, so the copy
 * stage has to survive a target path with a space and non-ASCII characters.
 * These run the installers' REAL copy code against a temp directory — never
 * the machine's actual Claude scope.
 */
const SPACED_UNICODE = "Hypermark install prüfung ünïcodé";
const isWindows = process.platform === "win32";

function stageFixture(): {
  root: string;
  repo: string;
  claudeScope: string;
  agentsScope: string;
  cleanup: () => void;
} {
  const root = join(mkdtempSync(join(tmpdir(), "pln-launcher-")), SPACED_UNICODE);
  const repo = join(root, "repo");
  mkdirSync(join(repo, "apps", "skills"), { recursive: true });
  cpSync(join(REPO_ROOT, "apps", "skills", "claude"), join(repo, "apps", "skills", "claude"), {
    recursive: true,
  });
  cpSync(join(REPO_ROOT, "apps", "skills", "core"), join(repo, "apps", "skills", "core"), {
    recursive: true,
  });
  return {
    root,
    repo,
    claudeScope: join(root, "home dir", ".claude", "skills"),
    agentsScope: join(root, "home dir", ".agents", "skills"),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function expectInstalledLaunchers(claudeScope: string) {
  for (const { skill, command } of LAUNCHERS) {
    const installed = join(claudeScope, skill, "SKILL.md");
    expect(existsSync(installed), `${skill} landed in ${claudeScope}`).toBe(true);
    const doc = readFileSync(installed, "utf-8").replace(/\r\n?/g, "\n");
    // The executing body survived the copy verbatim — not the prose variant.
    expect(doc, skill).toBe(readSkill(CLAUDE_DIR, skill));
    expect(doc, skill).toContain("!`plannotator " + command + " $ARGUMENTS`");
  }
  // Knowledge skill rides along from core/.
  expect(existsSync(join(claudeScope, "plannotator", "SKILL.md"))).toBe(true);
  // ... and the copy is not nested one level deeper (the re-run trap).
  expect(existsSync(join(claudeScope, "hypermark-review", "hypermark-review"))).toBe(
    false,
  );
}

describe.if(isWindows)("install.ps1 copy stage on a spaced/Unicode path", () => {
  test("Copy-SkillIfPresent installs the launchers verbatim and replaces on re-run", () => {
    const fixture = stageFixture();
    try {
      // Lift the real function out of install.ps1 rather than restating it.
      const ps1 = readInstaller("install.ps1");
      const start = ps1.indexOf("function Copy-SkillIfPresent {");
      expect(start, "Copy-SkillIfPresent not found in install.ps1").toBeGreaterThan(0);
      let depth = 0;
      let end = -1;
      for (let i = ps1.indexOf("{", start); i < ps1.length; i++) {
        if (ps1[i] === "{") depth++;
        else if (ps1[i] === "}" && --depth === 0) {
          end = i + 1;
          break;
        }
      }
      expect(end).toBeGreaterThan(start);
      const copyFn = ps1.slice(start, end);

      const harness = join(fixture.root, "harness.ps1");
      writeFileSync(
        harness,
        [
          "param([string]$Repo, [string]$ClaudeSkillsDir)",
          "$ErrorActionPreference = 'Stop'",
          copyFn,
          // Mirrors install.ps1: Push-Location into the checkout, then copy
          // relative source paths into the (spaced, non-ASCII) target scope.
          "Push-Location $Repo",
          "try {",
          "  New-Item -ItemType Directory -Force -Path $ClaudeSkillsDir | Out-Null",
          '  foreach ($skill in @("hypermark-review", "hypermark-annotate", "hypermark-last")) {',
          '    Copy-SkillIfPresent "apps\\skills\\claude\\$skill" $ClaudeSkillsDir',
          "  }",
          '  Copy-SkillIfPresent "apps\\skills\\core\\plannotator" $ClaudeSkillsDir',
          "} finally { Pop-Location }",
        ].join("\n"),
        "utf-8",
      );

      const run = () =>
        spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            harness,
            "-Repo",
            fixture.repo,
            "-ClaudeSkillsDir",
            fixture.claudeScope,
          ],
          { encoding: "utf-8" },
        );

      const first = run();
      expect(first.stderr, "first install").toBe("");
      expect(first.status).toBe(0);
      expectInstalledLaunchers(fixture.claudeScope);

      // Upgrades re-run the same copy; PowerShell's Copy-Item -Recurse into
      // an existing target would nest (dest\skill\skill) without the guard.
      const second = run();
      expect(second.stderr, "re-run").toBe("");
      expect(second.status).toBe(0);
      expectInstalledLaunchers(fixture.claudeScope);
    } finally {
      fixture.cleanup();
    }
  }, 60_000);
});

describe.if(isWindows)("install.cmd copy stage on a spaced/Unicode path", () => {
  test("the CLONE_OK block installs both scopes and parses as one block", () => {
    const fixture = stageFixture();
    try {
      // Lift the real copy stage out of install.cmd, from `if
      // "!CLONE_OK!"=="1" (` through its `) else (` arm.
      const cmd = readInstaller("install.cmd");
      const start = cmd.indexOf('if "!CLONE_OK!"=="1" (');
      expect(start, "CLONE_OK block not found in install.cmd").toBeGreaterThan(0);
      const endMarker = '    popd\n) else (\n    set "CHECKOUT_FAILED=1"\n)';
      const end = cmd.indexOf(endMarker, start);
      expect(end, "CLONE_OK block end not found").toBeGreaterThan(start);
      const block = cmd.slice(start, end + endMarker.length);

      const harness = join(fixture.root, "harness.cmd");
      writeFileSync(
        harness,
        [
          "@echo off",
          "setlocal enabledelayedexpansion",
          'set "SKILLS_TMP=%~1"',
          'set "CLAUDE_SKILLS_DIR=%~2"',
          'set "AGENTS_SKILLS_DIR=%~3"',
          'set "CLONE_OK=1"',
          // The clone already happened in this harness, so skip the narrowing
          // step the installer guards the same way on its shallow fallback.
          'set "SPARSE_CLONE=0"',
          'set "TAG=vTEST"',
          'set "CHECKOUT_FAILED=0"',
          block,
          'if "!CHECKOUT_FAILED!"=="1" exit /b 1',
          "endlocal",
          "exit /b 0",
        ].join("\r\n"),
        "utf-8",
      );

      // cmd.exe's own quote handling, not Node's: `/s` strips the outermost
      // pair and takes the rest verbatim, which is the only reliable way to
      // pass a spaced path as both the script and its arguments.
      const commandLine = [
        harness,
        fixture.root,
        fixture.claudeScope,
        fixture.agentsScope,
      ]
        .map((part) => `"${part}"`)
        .join(" ");
      const run = () =>
        spawnSync("cmd.exe", ["/d", "/s", "/c", `"${commandLine}"`], {
          encoding: "utf-8",
          windowsVerbatimArguments: true,
        });

      const first = run();
      // A stray `)` surfaces here as "The syntax of the command is incorrect."
      expect(first.stdout + first.stderr).not.toMatch(/syntax of the command/i);
      expect(first.status).toBe(0);
      expectInstalledLaunchers(fixture.claudeScope);
      // The shared-agent scope gets the prose bodies from core/, all four.
      for (const { skill } of LAUNCHERS) {
        const shared = join(fixture.agentsScope, skill, "SKILL.md");
        expect(existsSync(shared), `${skill} in agents scope`).toBe(true);
        expect(readFileSync(shared, "utf-8").replace(/\r\n?/g, "\n")).toBe(
          readSkill(CORE_DIR, skill),
        );
      }
      expect(existsSync(join(fixture.agentsScope, "plannotator", "SKILL.md"))).toBe(
        true,
      );

      const second = run();
      expect(second.status).toBe(0);
      expectInstalledLaunchers(fixture.claudeScope);
    } finally {
      fixture.cleanup();
    }
  }, 60_000);
});
