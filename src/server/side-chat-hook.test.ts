import { describe, expect, test } from "bun:test";
import { SIDE_CHAT_BASH_RULE, sideChatToolVerdict } from "./side-chat-hook";

const bash = (command: string) => sideChatToolVerdict("Bash", { command });

describe("sideChatToolVerdict", () => {
  test("lets read-only tools run", () => {
    for (const tool of ["Read", "WebSearch", "WebFetch", "ToolSearch", "mcp__plugin_context7_context7__query-docs"]) {
      expect(sideChatToolVerdict(tool, {})).toBeNull();
    }
  });

  test("refuses tools that write, run or start work", () => {
    for (const tool of ["Edit", "Write", "Agent", "Skill", "Monitor", "mcp__context__scrape"]) {
      expect(sideChatToolVerdict(tool, {})).toContain(tool);
    }
  });

  test("lets read-only commands through Bash", () => {
    expect(bash("rg -n isHiddenMessage src")).toBeNull();
    expect(bash("rg -n foo src | head -20")).toBeNull();
    expect(bash("git log --oneline -5")).toBeNull();
    expect(bash("sed -n '10,40p' src/cli/index.ts")).toBeNull();
  });

  test("reads |, ; and & inside quotes as part of the pattern", () => {
    expect(bash('rg -n -i "link|truncat|overflow|first and last|middle" README.md docs')).toBeNull();
    expect(bash('rg -o -m1 "Showing lines.{0,200}|File Path: .{0,200}" log.jsonl | head -5')).toBeNull();
    expect(bash("rg 'a;b&c' src")).toBeNull();
    expect(bash('rg "say \\"hi\\"" src')).toBeNull();
  });

  test("refuses a command substitution or a flag inside quotes", () => {
    for (const command of [
      'rg -o "File Path: `[^`]*index.ts`" log.jsonl',
      'rg "$(rm x)" src',
      'rg "--pre=./run.sh" foo',
      "git diff '--output=x'",
      'rg "foo',
    ]) {
      expect(bash(command)).not.toBeNull();
    }
  });

  test("refuses a chain or pipe with a command that writes or runs more", () => {
    for (const command of [
      "rm -rf src",
      "rg foo > out.txt",
      "rg foo; rm x",
      "rg foo && rm x",
      "rg foo || rm x",
      "cat $(rm x)",
      "rg --pre ./run.sh foo",
      "git commit -m x",
      "git diff --output=x",
      "sed -i 's/a/b/' x",
      "sed -n '1w out' x",
      "sed -n 1p -i x",
      "rg foo\nrm x",
      "rg foo | xargs rm",
    ]) {
      expect(bash(command)).not.toBeNull();
    }
  });

  test("refuses with the rule the side chat's prompt states, and every command that reads", () => {
    const reason = bash("rm -rf src") ?? "";
    expect(reason.startsWith(SIDE_CHAT_BASH_RULE)).toBe(true);
    for (const name of ["rg", "tail", "wc", "sed -n", "git log", "blame"]) expect(reason).toContain(name);
  });

  test("checks each command of a chain, with output thrown away", () => {
    for (const command of [
      'cd src && rg -n "foo" . | head -5; echo ---; git log -1',
      "rg foo 2>/dev/null | head",
      "git diff 2>&1 | head -20",
      "rg foo &>/dev/null || echo none",
      "git -C ../other --no-pager log -3",
      "git branch -a",
      "sed -n '1,5p;9,12p' a.ts",
      "sed -n '/^export/,$p' a.ts",
      "find src -name '*.ts' | sort | uniq -c",
      "grep -rn foo src # a comment",
    ]) {
      expect(bash(command)).toBeNull();
    }
  });

  test("refuses what the shell would expand or run beyond the words", () => {
    for (const command of [
      "rg ${X:=--pre=sh} foo",
      "rg $'\\x2d-pre=sh' foo",
      'rg $"--pre=sh" foo',
      "rg foo #'\nrm x #'",
      "rg --p\\\nre=sh foo",
      'rg "--p\\\nre=sh" foo',
      "find . -{delete,name} x",
      "rg foo &",
      "rg foo < list.txt",
      "(rg foo)",
      "rg foo >/dev/null2",
      "rg foo 2>out.txt",
    ]) {
      expect(bash(command)).not.toBeNull();
    }
  });

  test("refuses the flags and forms that write", () => {
    for (const command of [
      "sort -o out.txt a.txt",
      "sort -uo out.txt a.txt",
      "uniq a.txt b.txt",
      "git branch new-branch",
      "git branch -D old",
      "git grep -Ocat foo",
      "git -c core.pager=sh log",
      "find . -name x -execdir rm x",
      "sed -n '/a/w out' x",
    ]) {
      expect(bash(command)).not.toBeNull();
    }
  });

  // The commands tried against Claude Code's own read-only check (`dontAsk`
  // mode). Its verdicts match these except for the last allowed one, which it
  // refuses, and `git diff --output`, which it runs.
  test("agrees with Claude Code's read-only check on the reference commands", () => {
    for (const command of [
      'rg -n -i "link|truncat|overflow" CLAUDE.md',
      'rg -c "a;b&c" CLAUDE.md',
      "git log -1 --oneline",
      "sed -n 1,3p CLAUDE.md",
      "ls | sort | head -3",
      'rg -o "Showing lines.{0,20}|File Path: .{0,20}" CLAUDE.md | head -2',
    ]) {
      expect(bash(command)).toBeNull();
    }
    for (const command of [
      "rg --pre=cat foo CLAUDE.md",
      "echo hi > out.txt",
      'rg "$(echo x)" CLAUDE.md',
      "sed -i 's/x/y/' a.txt",
      "git diff --output=out.txt",
      "find . -maxdepth 1 -name x -delete",
    ]) {
      expect(bash(command)).not.toBeNull();
    }
  });
});
