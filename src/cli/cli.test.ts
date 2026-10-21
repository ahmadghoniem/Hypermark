import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatInteractiveNoArgClarification,
  formatSubcommandHelp,
  formatTopLevelHelp,
  formatVersion,
  hasHelpFlag,
  isInteractiveNoArgInvocation,
  isSubcommandHelpInvocation,
  isTopLevelHelpInvocation,
  isVersionInvocation,
  parseStrictAnnotateOptions,
} from "./cli";
import {
  findClosestSubcommand,
  findUnknownSubcommand,
  formatUnknownSubcommandError,
} from "./unknown-subcommand";

describe("CLI top-level help", () => {
  test("recognizes top-level --help", () => {
    expect(isTopLevelHelpInvocation(["--help"])).toBe(true);
    expect(isTopLevelHelpInvocation(["-h"])).toBe(true);
    expect(isTopLevelHelpInvocation([])).toBe(false);
    expect(isTopLevelHelpInvocation(["review", "--help"])).toBe(false);
  });

  test("renders concise top-level usage", () => {
    const output = formatTopLevelHelp();

    expect(output).toContain("hypermark --help");
    expect(output).toContain("hypermark --version, -v");
    expect(output).toContain("hypermark review [--git]");
    expect(output).toContain("hypermark annotate <file.md | file.txt> [--gate]");
    expect(output).toContain("hypermark annotate-last [--stdin]");
    expect(output).toContain("Run 'hypermark <command> --help' for command-specific usage.");
  });
});

describe("CLI subcommand help", () => {
  test("hasHelpFlag detects --help / -h anywhere", () => {
    expect(hasHelpFlag(["--help"])).toBe(true);
    expect(hasHelpFlag(["-h"])).toBe(true);
    expect(hasHelpFlag(["file.md", "--help"])).toBe(true);
    expect(hasHelpFlag(["--git"])).toBe(false);
    expect(hasHelpFlag([])).toBe(false);
  });

  test("recognizes `review --help` as a subcommand help invocation", () => {
    expect(isSubcommandHelpInvocation(["review", "--help"])).toBe("review");
    expect(isSubcommandHelpInvocation(["review", "-h"])).toBe("review");
    // help flag may appear after other args (agents probe in various ways)
    expect(isSubcommandHelpInvocation(["annotate", "file.md", "--help"])).toBe(
      "annotate",
    );
  });

  test("does not treat a real review invocation as help", () => {
    expect(isSubcommandHelpInvocation(["review"])).toBeNull();
    expect(isSubcommandHelpInvocation(["review", "--git"])).toBeNull();
  });

  test("resolves the `last` alias to annotate-last help", () => {
    expect(isSubcommandHelpInvocation(["last", "--help"])).toBe("annotate-last");
    expect(isSubcommandHelpInvocation(["annotate-last", "--help"])).toBe(
      "annotate-last",
    );
  });

  test("covers every command advertised in top-level help", () => {
    // Each command listed in formatTopLevelHelp() must respond to --help so the
    // advertised "run 'hypermark <command> --help'" contract holds.
    for (const sub of [
      "annotate",
      "sessions",
    ]) {
      expect(isSubcommandHelpInvocation([sub, "--help"])).toBe(sub);
    }
  });

  test("ignores help flags for unknown / internal subcommands", () => {
    expect(isSubcommandHelpInvocation(["unknown-command", "--help"])).toBeNull();
    expect(isSubcommandHelpInvocation(["--help"])).toBeNull();
    expect(isSubcommandHelpInvocation([])).toBeNull();
  });

  test("renders subcommand-specific usage", () => {
    expect(formatSubcommandHelp("review")).toContain(
      "hypermark review [--git]",
    );
    expect(formatSubcommandHelp("review")).toContain("--git");
    expect(formatSubcommandHelp("annotate")).not.toContain("--markdown");
    expect(formatSubcommandHelp("annotate")).toContain("--require-approval");
    expect(formatSubcommandHelp("annotate")).toContain("--result-file <path>");
    expect(formatSubcommandHelp("annotate-last")).not.toContain(
      "--require-approval",
    );
    expect(formatSubcommandHelp("sessions")).toContain("--open [N]");
    // unknown key falls back to top-level help
    expect(formatSubcommandHelp("nope")).toBe(formatTopLevelHelp());
  });
});

describe("strict annotate CLI options", () => {
  test("extracts strict options before or after the target path", () => {
    const strictOrderings = [
      ["plan.md", "--require-approval", "--result-file", "result.json"],
      ["plan.md", "--result-file", "result.json", "--require-approval"],
      ["--require-approval", "plan.md", "--result-file", "result.json"],
      ["--require-approval", "--result-file", "result.json", "plan.md"],
      ["--result-file", "result.json", "plan.md", "--require-approval"],
      ["--result-file", "result.json", "--require-approval", "plan.md"],
    ];

    for (const ordering of strictOrderings) {
      expect(
        parseStrictAnnotateOptions([
          "annotate",
          ...ordering,
          "--gate",
          "--json",
        ]),
      ).toEqual({
        requireApproval: true,
        resultFile: "result.json",
        remainingArgs: ["annotate", "plan.md", "--gate", "--json"],
      });
    }
  });

  test("allows either strict option independently", () => {
    expect(
      parseStrictAnnotateOptions([
        "annotate",
        "plan.md",
        "--gate",
        "--json",
        "--require-approval",
      ]),
    ).toEqual({
      requireApproval: true,
      remainingArgs: ["annotate", "plan.md", "--gate", "--json"],
    });
    expect(
      parseStrictAnnotateOptions([
        "annotate",
        "--result-file",
        "result.json",
        "plan.md",
        "--gate",
        "--json",
      ]),
    ).toEqual({
      requireApproval: false,
      resultFile: "result.json",
      remainingArgs: ["annotate", "plan.md", "--gate", "--json"],
    });
  });

  test("leaves ordinary direct arguments unchanged", () => {
    const args = [
      "annotate",
      "plan.md",
      "--gate",
      "--json",
    ];
    expect(parseStrictAnnotateOptions(args)).toEqual({
      requireApproval: false,
      remainingArgs: args,
    });
  });

  test("requires annotate --gate --json without --hook", () => {
    for (const args of [
      ["review", "--gate", "--json", "--require-approval"],
      ["annotate-last", "--gate", "--json", "--require-approval"],
      ["annotate", "plan.md", "--json", "--require-approval"],
      ["annotate", "plan.md", "--gate", "--require-approval"],
      [
        "annotate",
        "plan.md",
        "--gate",
        "--json",
        "--hook",
        "--require-approval",
      ],
    ]) {
      expect(() => parseStrictAnnotateOptions(args)).toThrow();
    }
  });

  test("rejects missing and duplicate strict option values", () => {
    expect(() =>
      parseStrictAnnotateOptions([
        "annotate",
        "plan.md",
        "--gate",
        "--json",
        "--result-file",
      ]),
    ).toThrow("Missing value for --result-file");
    expect(() =>
      parseStrictAnnotateOptions([
        "annotate",
        "plan.md",
        "--gate",
        "--json",
        "--result-file",
        "first.json",
        "--result-file",
        "second.json",
      ]),
    ).toThrow("--result-file may only be specified once");
    expect(() =>
      parseStrictAnnotateOptions([
        "annotate",
        "plan.md",
        "--gate",
        "--json",
        "--require-approval",
        "--require-approval",
      ]),
    ).toThrow("--require-approval may only be specified once");
  });
});

describe("CLI --version", () => {
  test("recognizes --version and -v", () => {
    expect(isVersionInvocation(["--version"])).toBe(true);
    expect(isVersionInvocation(["-v"])).toBe(true);
    expect(isVersionInvocation([])).toBe(false);
    expect(isVersionInvocation(["review"])).toBe(false);
  });

  test("formats version string", () => {
    const output = formatVersion();
    expect(output).toStartWith("hypermark ");
  });
});

describe("interactive no-arg invocation", () => {
  test("detects bare interactive invocation only when stdin is a TTY", () => {
    expect(isInteractiveNoArgInvocation([], true)).toBe(true);
    expect(isInteractiveNoArgInvocation([], false)).toBe(false);
    expect(isInteractiveNoArgInvocation([], undefined)).toBe(false);
    expect(isInteractiveNoArgInvocation(["review"], true)).toBe(false);
  });

  test("renders clarification for interactive users", () => {
    const output = formatInteractiveNoArgClarification();

    expect(output).toContain("does nothing in an interactive terminal");
    expect(output).toContain("hypermark review");
    expect(output).toContain("hypermark sessions");
    expect(output).toContain("Run 'hypermark --help' for top-level usage.");
  });
});

describe("unknown subcommand error", () => {
  describe("unknown subcommand", () => {
    test("leaves flags and the no-argument hook invocation to the dispatcher", () => {
      expect(findUnknownSubcommand([])).toBeNull();
      expect(findUnknownSubcommand(["--help"])).toBeNull();
      expect(findUnknownSubcommand(["-v"])).toBeNull();
      expect(findUnknownSubcommand(["review", "--nonsense"])).toBeNull();
    });

    test("reports the offending token", () => {
      expect(findUnknownSubcommand(["annotatte", "README.md"])).toBe("annotatte");
      expect(findUnknownSubcommand(["xyzzy"])).toBe("xyzzy");
    });

    test("suggests the nearest documented command", () => {
      expect(findClosestSubcommand("annotatte")).toBe("annotate");
      expect(findClosestSubcommand("revieww")).toBe("review");
      expect(findClosestSubcommand("sesions")).toBe("sessions");
      expect(findClosestSubcommand("annot")).toBe("annotate");
      expect(findClosestSubcommand("a")).toBeNull();
      expect(findClosestSubcommand("xyzzy")).toBeNull();
      expect(findClosestSubcommand("x".repeat(10_000))).toBeNull();
    });

    test("error text names the typo and points at --help", () => {
      const message = formatUnknownSubcommandError("annotatte");
      expect(message).toContain("Unknown command: annotatte");
      expect(message).toContain("hypermark annotate");
      expect(message).toContain("--help");
    });

    test("a typo'd subcommand exits instead of blocking on an open stdin", async () => {
      // The spawned CLI imports ../dist/{index,review}.html at module load.
      // Dev machines always have them built, but CI's test job does not build
      // the apps, so drop empty placeholders for any missing artifact and
      // remove exactly what this test created afterwards. The guard under test
      // exits before either page is ever served, so content is irrelevant.
      const distDir = resolve(import.meta.dir, "../dist");
      const created: string[] = [];
      let createdDir = false;
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
        createdDir = true;
      }
      for (const name of ["index.html", "review.html"]) {
        const file = resolve(distDir, name);
        if (!existsSync(file)) {
          writeFileSync(file, "<!doctype html>");
          created.push(file);
        }
      }
      try {
      const proc = Bun.spawn(
        [
          "bun",
          "run",
          resolve(import.meta.dir, "index.ts"),
          "annotatte",
          "README.md",
        ],
        {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const timeout = setTimeout(() => proc.kill(), 15_000);
      const [stderr, code] = await Promise.all([
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      clearTimeout(timeout);

      expect(code).toBe(1);
      expect(stderr).toContain("Unknown command: annotatte");
      expect(stderr).toContain("hypermark annotate");
      } finally {
        for (const file of created) rmSync(file, { force: true });
        if (createdDir) rmSync(distDir, { recursive: true, force: true });
      }
    }, 30_000);
  });
});
