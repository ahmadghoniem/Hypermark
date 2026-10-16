import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDoc } from "./reference-handlers";

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

async function getDoc(path: string, options: { base?: string; rootPaths?: string[]; doc?: boolean }) {
	const url = new URL("http://localhost/api/doc");
	url.searchParams.set("path", path);
	if (options.base) url.searchParams.set("base", options.base);
	if (options.doc) url.searchParams.set("doc", "1");
	return handleDoc(new Request(url.toString()), {
		rootPaths: options.rootPaths,
	});
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("handleDoc path containment", () => {
	test("does not read a document through an out-of-root base directory", async () => {
		const root = makeTempDir("hypermark-doc-root-");
		const outside = makeTempDir("hypermark-doc-outside-");
		writeTempFile(outside, "secret.md", "secret");

		const res = await getDoc("secret.md", { base: outside, rootPaths: [root] });

		expect(res.status).toBe(404);
	});

	// Lexical containment alone would serve a symlink inside the root that
	// points outside it.
	test("does not read through a symlink that leaves the root", async () => {
		const root = makeTempDir("hypermark-doc-root-");
		const outside = makeTempDir("hypermark-doc-outside-");
		const secret = writeTempFile(outside, "secret.md", "secret");
		const link = join(root, "linked.md");
		try {
			symlinkSync(secret, link, "file");
		} catch {
			// Windows without Developer Mode cannot create symlinks.
			return;
		}

		for (const res of [
			await getDoc(link, { rootPaths: [root] }),
			await getDoc("linked.md", { base: root, rootPaths: [root] }),
			await getDoc("linked.md", { rootPaths: [root] }),
		]) {
			expect(res.status).toBe(403);
		}
	});

	test("reads through a symlink that stays inside the root", async () => {
		const root = makeTempDir("hypermark-doc-root-");
		const target = writeTempFile(root, "docs/real.md", "inside");
		const link = join(root, "alias.md");
		try {
			symlinkSync(target, link, "file");
		} catch {
			return;
		}

		const res = await getDoc(link, { rootPaths: [root] });
		expect(res.status).toBe(200);
		expect((await res.json() as { markdown: string }).markdown).toBe("inside");
	});
});

describe("annotatable plain-text files (#1029)", () => {
	test("doc=1 serves a .yaml file as an annotatable markdown document", async () => {
		const root = makeTempDir("hypermark-doc-yaml-");
		const file = writeTempFile(root, "config.yaml", "key: value\n");

		const res = await getDoc(file, { rootPaths: [root], doc: true });
		const data = await res.json() as { markdown?: string; codeFile?: boolean };

		expect(res.status).toBe(200);
		expect(data.codeFile).toBeUndefined();
		expect(data.markdown).toBe("key: value\n");
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
