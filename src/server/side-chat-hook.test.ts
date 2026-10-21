import { describe, expect, test } from "bun:test";
import { sideChatToolVerdict } from "./side-chat-hook";

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

  test("lets read-only commands through Bash, piped into head", () => {
    expect(bash("rg -n isHiddenMessage src")).toBeNull();
    expect(bash("rg -n foo src | head -20")).toBeNull();
    expect(bash("git log --oneline -5")).toBeNull();
    expect(bash("sed -n '10,40p' src/cli/index.ts")).toBeNull();
  });

  test("refuses commands that write, chain or run more", () => {
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
      "rg foo | xargs rm",
    ]) {
      expect(bash(command)).not.toBeNull();
    }
  });
});
