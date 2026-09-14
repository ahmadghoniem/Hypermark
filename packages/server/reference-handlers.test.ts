import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { handleDoc, handleDocExists } from "./reference-handlers";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function writeTempFile(root: string, relativePath: string, content = "x"): string {
	const full = join(root, relativePath);
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, content);
	return full;
}

async function postDocExists(body: unknown, options: { rootPath?: string; rootPaths?: string[] }) {
	const res = await handleDocExists(
		new Request("http://localhost/api/doc/exists", {
			method: "POST",
			body: JSON.stringify(body),
		}),
		options,
	);
	return res.json() as Promise<{
		results: Record<string, { status: "found"; resolved: string } | { status: "missing" }>;
	}>;
}

async function getDoc(path: string, options: { base?: string; rootPaths?: string[]; sourceSaveFilePath?: string; doc?: boolean }) {
	const url = new URL("http://localhost/api/doc");
	url.searchParams.set("path", path);
	if (options.base) url.searchParams.set("base", options.base);
	if (options.doc) url.searchParams.set("doc", "1");
	return handleDoc(new Request(url.toString()), {
		rootPaths: options.rootPaths,
		sourceSaveFilePath: options.sourceSaveFilePath,
	});
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("handleDocExists", () => {
	test("does not reveal absolute files outside the allowed root", async () => {
		const root = makeTempDir("hypermark-doc-exists-root-");
		const outside = makeTempDir("hypermark-doc-exists-outside-");
		const secret = writeTempFile(outside, "secret.ts", "secret");

		const data = await postDocExists({ paths: [secret] }, { rootPath: root });

		expect(data.results[secret]).toEqual({ status: "missing" });
	});

	test("allows absolute files inside the allowed root", async () => {
		const root = makeTempDir("hypermark-doc-exists-root-");
		const file = writeTempFile(root, "src/app.ts", "app");

		const data = await postDocExists({ paths: [file] }, { rootPath: root });

		expect(data.results[file]).toEqual({ status: "found", resolved: file });
	});

	test("ignores an out-of-root base directory", async () => {
		const root = makeTempDir("hypermark-doc-exists-root-");
		const outside = makeTempDir("hypermark-doc-exists-outside-");
		writeTempFile(outside, "secret.ts", "secret");

		const data = await postDocExists({ base: outside, paths: ["secret.ts"] }, { rootPath: root });

		expect(data.results["secret.ts"]).toEqual({ status: "missing" });
	});

	test("resolves relative paths from an in-root base directory", async () => {
		const root = makeTempDir("hypermark-doc-exists-root-");
		const app = writeTempFile(root, "src/app.ts", "app");
		const base = resolve(root, "docs/nested");
		mkdirSync(base, { recursive: true });

		const data = await postDocExists({ base, paths: ["../../src/app.ts"] }, { rootPath: root });

		expect(data.results["../../src/app.ts"]).toEqual({ status: "found", resolved: app });
	});

	test("single-file annotate can validate repo paths outside the source file directory", async () => {
		const root = makeTempDir("hypermark-doc-exists-root-");
		const app = writeTempFile(root, "src/app.ts", "app");
		const sourceDir = join(root, "docs");
		mkdirSync(sourceDir, { recursive: true });

		const data = await postDocExists(
			{ base: sourceDir, paths: ["src/app.ts"] },
			{ rootPaths: [root, sourceDir] },
		);

		expect(data.results["src/app.ts"]).toEqual({ status: "found", resolved: app });
	});

	test("does not read a document through an out-of-root base directory", async () => {
		const root = makeTempDir("hypermark-doc-root-");
		const outside = makeTempDir("hypermark-doc-outside-");
		writeTempFile(outside, "secret.md", "secret");

		const res = await getDoc("secret.md", { base: outside, rootPaths: [root] });

		expect(res.status).toBe(404);
	});

	test("single-file source document returns current source-save metadata", async () => {
		const root = makeTempDir("hypermark-doc-root-");
		const source = writeTempFile(root, "docs/source.md", "source\n");

		const res = await getDoc(source, {
			rootPaths: [root],
			sourceSaveFilePath: source,
		});
		const data = await res.json() as { markdown?: string; sourceSave?: { enabled: boolean; scope?: string; path?: string; hash?: string } };

		expect(res.status).toBe(200);
		expect(data.markdown).toBe("source\n");
		expect(data.sourceSave?.enabled).toBe(true);
		expect(data.sourceSave?.scope).toBe("single-file");
		expect(data.sourceSave?.path).toBe(realpathSync(source));
		expect(data.sourceSave?.hash).toStartWith("sha256:");
	});

	test("single-file source-save metadata is not added to other linked documents", async () => {
		const root = makeTempDir("hypermark-doc-root-");
		const source = writeTempFile(root, "docs/source.md", "source\n");
		const linked = writeTempFile(root, "docs/linked.md", "linked\n");

		const res = await getDoc(linked, {
			rootPaths: [root],
			sourceSaveFilePath: source,
		});
		const data = await res.json() as { markdown?: string; sourceSave?: unknown };

		expect(res.status).toBe(200);
		expect(data.markdown).toBe("linked\n");
		expect(data.sourceSave).toBeUndefined();
	});
});

describe("annotatable plain-text files (#1029)", () => {
	test("doc=1 serves a .yaml file as an annotatable markdown document", async () => {
		const root = makeTempDir("hypermark-doc-yaml-");
		const file = writeTempFile(root, "config.yaml", "key: value\n");

		const res = await getDoc(file, { rootPaths: [root], doc: true });
		const data = await res.json() as { markdown?: string; codeFile?: boolean; renderAs?: string };

		expect(res.status).toBe(200);
		expect(data.codeFile).toBeUndefined();
		expect(data.markdown).toBe("key: value\n");
		expect(data.renderAs).toBe("markdown");
	});

	test("without doc=1, a .yaml path keeps the code-file popout response", async () => {
		const root = makeTempDir("hypermark-doc-yaml-code-");
		writeTempFile(root, "config.yaml", "key: value\n");

		const res = await getDoc("config.yaml", { rootPaths: [root] });
		const data = await res.json() as { codeFile?: boolean; contents?: string };

		expect(res.status).toBe(200);
		expect(data.codeFile).toBe(true);
		expect(data.contents).toBe("key: value\n");
	});

	test("non-code annotatable extensions serve as markdown without doc=1", async () => {
		const root = makeTempDir("hypermark-doc-csv-");
		writeTempFile(root, "data.csv", "a,b\n1,2\n");

		const res = await getDoc("data.csv", { rootPaths: [root] });
		const data = await res.json() as { markdown?: string; codeFile?: boolean };

		expect(res.status).toBe(200);
		expect(data.codeFile).toBeUndefined();
		expect(data.markdown).toBe("a,b\n1,2\n");
	});
});

describe("annotatable document size cap", () => {
	test("doc=1 rejects an oversized file with 413", async () => {
		const root = makeTempDir("hypermark-doc-cap-");
		const big = join(root, "huge.yaml");
		writeFileSync(big, `key: ${"x".repeat(2 * 1024 * 1024 + 1)}\n`);

		const res = await getDoc(big, { rootPaths: [root], doc: true });
		const data = await res.json() as { error?: string };

		expect(res.status).toBe(413);
		expect(data.error).toBe("File too large (max 2MB)");
	});

	test("markdown fallback rejects an oversized .md with 413", async () => {
		const root = makeTempDir("hypermark-md-cap-");
		writeFileSync(join(root, "huge.md"), `# big\n${"x".repeat(2 * 1024 * 1024 + 1)}\n`);

		const res = await getDoc("huge.md", { rootPaths: [root] });
		const data = await res.json() as { error?: string };

		expect(res.status).toBe(413);
		expect(data.error).toBe("File too large (max 2MB)");
	});

	test("base-relative branch rejects an oversized relative doc with 413", async () => {
		const root = makeTempDir("hypermark-base-cap-");
		writeFileSync(join(root, "big.txt"), "x".repeat(2 * 1024 * 1024 + 1));

		const res = await getDoc("big.txt", { rootPaths: [root], base: root });
		const data = await res.json() as { error?: string };

		expect(res.status).toBe(413);
		expect(data.error).toBe("File too large (max 2MB)");
	});
});
