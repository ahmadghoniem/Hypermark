import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
	getFileBrowserMaxFiles,
	resolveMarkdownFile,
} from "./resolve-file";
// Pure predicates (explicit extras) so this file never reads the real user
// config through the config-aware re-exports.
import { isAnnotatableTextPath } from "./annotatable";

// Hermeticity: resolveMarkdownFile falls back to the config-aware extras when
// no override is passed, which would read the developer's real config.json.
// Every call in this file pins the extras instead.
const NO_EXTRAS = { extraMarkdownExtensions: [] as const };

describe("bounded file traversal", () => {
	test("parses the shared file limit with the established fallback semantics", () => {
		const previousLimit = process.env.HYPERMARK_FILE_BROWSER_MAX_FILES;
		try {
			for (const invalid of ["", "0", "-1", "not-a-number"]) {
				process.env.HYPERMARK_FILE_BROWSER_MAX_FILES = invalid;
				expect(getFileBrowserMaxFiles()).toBe(5_000);
			}

			process.env.HYPERMARK_FILE_BROWSER_MAX_FILES = "12files";
			expect(getFileBrowserMaxFiles()).toBe(12);
		} finally {
			if (previousLimit === undefined) {
				delete process.env.HYPERMARK_FILE_BROWSER_MAX_FILES;
			} else {
				process.env.HYPERMARK_FILE_BROWSER_MAX_FILES = previousLimit;
			}
		}
	});

	test("caps fallback markdown discovery", () => {
		const limitedRoot = mkdtempSync(join(tmpdir(), "hypermark-markdown-limit-"));
		const previousLimit = process.env.HYPERMARK_FILE_BROWSER_MAX_FILES;
		try {
			for (const directory of ["one", "two", "three"]) {
				mkdirSync(join(limitedRoot, directory));
				writeFileSync(join(limitedRoot, directory, "plan.md"), `# ${directory}\n`);
			}
			process.env.HYPERMARK_FILE_BROWSER_MAX_FILES = "2";

			const result = resolveMarkdownFile("plan.md", limitedRoot, NO_EXTRAS);
			expect(result.kind).toBe("ambiguous");
			if (result.kind === "ambiguous") {
				expect(result.matches).toHaveLength(2);
			}
		} finally {
			if (previousLimit === undefined) {
				delete process.env.HYPERMARK_FILE_BROWSER_MAX_FILES;
			} else {
				process.env.HYPERMARK_FILE_BROWSER_MAX_FILES = previousLimit;
			}
			rmSync(limitedRoot, { recursive: true, force: true });
		}
	});

	test("keeps exact and in-budget bare markdown resolution working", () => {
		const exactRoot = mkdtempSync(join(tmpdir(), "hypermark-markdown-exact-"));
		const bareRoot = mkdtempSync(join(tmpdir(), "hypermark-markdown-bare-"));
		const previousLimit = process.env.HYPERMARK_FILE_BROWSER_MAX_FILES;
		try {
			mkdirSync(join(exactRoot, "docs"));
			writeFileSync(join(exactRoot, "docs", "plan.md"), "# Exact\n");
			mkdirSync(join(bareRoot, "notes"));
			writeFileSync(join(bareRoot, "notes", "Architecture.MD"), "# Bare\n");
			process.env.HYPERMARK_FILE_BROWSER_MAX_FILES = "1";

			expect(resolveMarkdownFile("docs/plan.md", exactRoot, NO_EXTRAS)).toEqual({
				kind: "found",
				path: join(exactRoot, "docs", "plan.md"),
			});
			expect(resolveMarkdownFile("architecture.md", bareRoot, NO_EXTRAS)).toEqual({
				kind: "found",
				path: join(bareRoot, "notes", "Architecture.MD"),
			});
		} finally {
			if (previousLimit === undefined) {
				delete process.env.HYPERMARK_FILE_BROWSER_MAX_FILES;
			} else {
				process.env.HYPERMARK_FILE_BROWSER_MAX_FILES = previousLimit;
			}
			rmSync(exactRoot, { recursive: true, force: true });
			rmSync(bareRoot, { recursive: true, force: true });
		}
	});
});

describe("explicit parent-relative markdown paths (#1085)", () => {
	test("resolves a ../ path that escapes the project root", () => {
		const parent = mkdtempSync(join(tmpdir(), "hypermark-md-parent-"));
		try {
			mkdirSync(join(parent, "docs", "radio"), { recursive: true });
			writeFileSync(join(parent, "docs", "radio", "plan.md"), "# Plan\n");
			const cwd = join(parent, "work");
			mkdirSync(cwd);

			expect(resolveMarkdownFile("../docs/radio/plan.md", cwd, NO_EXTRAS)).toEqual({
				kind: "found",
				path: join(parent, "docs", "radio", "plan.md"),
			});
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("resolves a ./ explicit path within the root", () => {
		const cwd = mkdtempSync(join(tmpdir(), "hypermark-md-dot-"));
		try {
			mkdirSync(join(cwd, "sub"));
			writeFileSync(join(cwd, "sub", "notes.md"), "# Notes\n");
			expect(resolveMarkdownFile("./sub/notes.md", cwd, NO_EXTRAS)).toEqual({
				kind: "found",
				path: join(cwd, "sub", "notes.md"),
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("a bare filename does NOT escape into a parent directory", () => {
		const parent = mkdtempSync(join(tmpdir(), "hypermark-md-bare-esc-"));
		try {
			writeFileSync(join(parent, "secret.md"), "# Parent\n");
			const cwd = join(parent, "work");
			mkdirSync(cwd);
			expect(resolveMarkdownFile("secret.md", cwd, NO_EXTRAS)).toEqual({
				kind: "not_found",
				input: "secret.md",
			});
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("a ../ path to a missing file is still not_found", () => {
		const cwd = mkdtempSync(join(tmpdir(), "hypermark-md-missing-"));
		try {
			expect(resolveMarkdownFile("../nope/absent.md", cwd, NO_EXTRAS)).toEqual({
				kind: "not_found",
				input: "../nope/absent.md",
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("annotatable plain-text files (#1029)", () => {
	test("resolves an exact relative .yaml path", () => {
		const cwd = mkdtempSync(join(tmpdir(), "hypermark-annotatable-yaml-"));
		try {
			mkdirSync(join(cwd, "config"));
			writeFileSync(join(cwd, "config", "app.yaml"), "key: value\n");
			expect(resolveMarkdownFile("config/app.yaml", cwd, NO_EXTRAS)).toEqual({
				kind: "found",
				path: join(cwd, "config", "app.yaml"),
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("resolves a bare filename in-root for a config format", () => {
		const cwd = mkdtempSync(join(tmpdir(), "hypermark-annotatable-bare-"));
		try {
			mkdirSync(join(cwd, "nested"));
			writeFileSync(join(cwd, "nested", "Cargo.toml"), "[package]\n");
			expect(resolveMarkdownFile("cargo.toml", cwd, NO_EXTRAS)).toEqual({
				kind: "found",
				path: join(cwd, "nested", "Cargo.toml"),
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("accepts each newly supported extension", () => {
		const cwd = mkdtempSync(join(tmpdir(), "hypermark-annotatable-all-"));
		try {
			const names = [
				"a.yaml", "b.yml", "c.json", "d.jsonc", "e.json5", "f.toml",
				"g.ini", "h.cfg", "i.conf", "j.properties", "k.csv", "l.tsv",
				"m.log", "n.xml", "sample.env.example",
			];
			for (const name of names) {
				writeFileSync(join(cwd, name), "content\n");
			}
			for (const name of names) {
				expect(resolveMarkdownFile(name, cwd, NO_EXTRAS)).toEqual({
					kind: "found",
					path: join(cwd, name),
				});
			}
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("still rejects source-code extensions", () => {
		const cwd = mkdtempSync(join(tmpdir(), "hypermark-annotatable-code-"));
		try {
			writeFileSync(join(cwd, "script.py"), "print('hi')\n");
			expect(resolveMarkdownFile("script.py", cwd, NO_EXTRAS)).toEqual({
				kind: "not_found",
				input: "script.py",
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("rejects .env but accepts .env.example", () => {
		const cwd = mkdtempSync(join(tmpdir(), "hypermark-annotatable-env-"));
		try {
			writeFileSync(join(cwd, ".env"), "SECRET=1\n");
			writeFileSync(join(cwd, ".env.example"), "SECRET=\n");
			expect(resolveMarkdownFile(".env", cwd, NO_EXTRAS)).toEqual({
				kind: "not_found",
				input: ".env",
			});
			expect(resolveMarkdownFile(".env.example", cwd, NO_EXTRAS)).toEqual({
				kind: "found",
				path: join(cwd, ".env.example"),
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	// #1307: `markdownExtensions` in config.json must make an extension
	// resolvable everywhere .md is. The list is threaded in explicitly here so
	// the test never touches the user's real config.json.
	test("configured extra extensions resolve like markdown, and only when configured", () => {
		const cwd = mkdtempSync(join(tmpdir(), "hypermark-livemd-"));
		try {
			mkdirSync(join(cwd, "notebooks"), { recursive: true });
			writeFileSync(join(cwd, "notebooks/tour.livemd"), "# Tour\n");
			const configured = { extraMarkdownExtensions: [".livemd"] };

			// Exact relative path, and the fuzzy bare-filename walk.
			expect(resolveMarkdownFile("notebooks/tour.livemd", cwd, configured)).toEqual({
				kind: "found",
				path: join(cwd, "notebooks/tour.livemd"),
			});
			expect(resolveMarkdownFile("tour.livemd", cwd, configured)).toEqual({
				kind: "found",
				path: join(cwd, "notebooks/tour.livemd"),
			});

			// Default (no configuration): unchanged "unsupported type" behavior.
			expect(
				resolveMarkdownFile("notebooks/tour.livemd", cwd, { extraMarkdownExtensions: [] }),
			).toEqual({ kind: "not_found", input: "notebooks/tour.livemd" });
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("the predicate classifies text vs unsupported paths", () => {
		expect(isAnnotatableTextPath("notes.yaml")).toBe(true);
		expect(isAnnotatableTextPath("notes.txt")).toBe(true);
		expect(isAnnotatableTextPath("page.html")).toBe(false);
		expect(isAnnotatableTextPath("app.ts")).toBe(false);
		expect(isAnnotatableTextPath(".env")).toBe(false);
		expect(isAnnotatableTextPath("config.json5")).toBe(true);
		expect(isAnnotatableTextPath("binary.png")).toBe(false);
	});
});
