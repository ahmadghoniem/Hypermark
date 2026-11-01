/**
 * Smart markdown file resolution.
 *
 * Resolves a user-provided path to an absolute file path using three strategies:
 * 1. Exact path (absolute or relative to cwd)
 * 2. Case-insensitive relative path search within project root
 * 3. Case-insensitive bare filename search within project root
 *
 * Used by the CLI (`hypermark annotate`).
 */

import { homedir } from "os";
import { isAbsolute, join, resolve, win32 } from "path";
import { existsSync, readdirSync, type Dirent } from "fs";

import { buildAnnotatableTextRegex } from "./annotatable";
import { getExtraMarkdownExtensions } from "./markdown-extensions";
export { MAX_ANNOTATABLE_FILE_BYTES } from "./annotatable";
/**
 * Extension predicates re-exported here are the CONFIG-AWARE ones:
 * they honor the user's `markdownExtensions` on top of the built-in set. The
 * pure built-in constants stay in src/shared/annotatable.ts for browser
 * code; server code must go through these so a configured `.livemd` is
 * accepted everywhere `.md` is.
 */
export {
	getAnnotatableExtensionsHint,
	getExtraMarkdownExtensions,
	isAnnotatableTextPath,
} from "./markdown-extensions";

const WINDOWS_DRIVE_PATH_PATTERNS = [
	/^\/cygdrive\/([a-zA-Z])\/(.+)$/,
	/^\/([a-zA-Z])\/(.+)$/,
];

const IGNORED_DIRS = [
	"node_modules/",
	".git/",
	"dist/",
	"build/",
	".next/",
	"__pycache__/",
	".obsidian/",
	".trash/",
];

const DEFAULT_FILE_BROWSER_MAX_FILES = 5_000;

/**
 * Return the shared file-traversal budget used by resolution and file-browser
 * discovery. Invalid or non-positive overrides fall back to
 * the default.
 */
export function getFileBrowserMaxFiles(): number {
	const value = Number.parseInt(
		process.env.HYPERMARK_FILE_BROWSER_MAX_FILES ?? "",
		10,
	);
	return Number.isFinite(value) && value > 0
		? value
		: DEFAULT_FILE_BROWSER_MAX_FILES;
}

export type ResolveResult =
	| { kind: "found"; path: string }
	| { kind: "not_found"; input: string }
	| { kind: "ambiguous"; input: string; matches: string[] }
	| { kind: "unavailable"; input: string };

function normalizeSeparators(input: string): string {
	return input.replace(/\\/g, "/");
}

function stripTrailingSlashes(input: string): string {
	return input.replace(/\/+$/, "");
}

export function expandHomePath(input: string, home = homedir()): string {
	if (input === "~") {
		return home;
	}

	if (input.startsWith("~/") || input.startsWith("~\\")) {
		return join(home, input.slice(2));
	}

	return input;
}

export function stripWrappingQuotes(input: string): string {
	if (input.length < 2) {
		return input;
	}

	const first = input[0];
	const last = input[input.length - 1];
	if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
		return input.slice(1, -1);
	}

	return input;
}

export function normalizeUserPathInput(
	input: string,
	platform = process.platform,
): string {
	const trimmedInput = input.trim();
	const unquotedInput = stripWrappingQuotes(trimmedInput);
	const expandedInput = expandHomePath(unquotedInput);

	if (platform !== "win32") {
		return expandedInput;
	}

	for (const pattern of WINDOWS_DRIVE_PATH_PATTERNS) {
		const match = expandedInput.match(pattern);
		if (!match) {
			continue;
		}

		const [, driveLetter, rest] = match;
		return `${driveLetter.toUpperCase()}:/${rest}`;
	}

	return expandedInput;
}

function isAbsoluteNormalizedUserPath(
	input: string,
	platform = process.platform,
): boolean {
	if (hasWindowsDriveLetter(input)) {
		return true;
	}

	return platform === "win32"
		? win32.isAbsolute(input)
		: isAbsolute(input);
}

export function isAbsoluteUserPath(
	input: string,
	platform = process.platform,
): boolean {
	return isAbsoluteNormalizedUserPath(normalizeUserPathInput(input, platform), platform);
}

export function resolveUserPath(
	input: string,
	baseDir = process.cwd(),
	platform = process.platform,
): string {
	const normalizedInput = normalizeUserPathInput(input, platform);
	if (!normalizedInput) {
		return "";
	}
	return isAbsoluteNormalizedUserPath(normalizedInput, platform)
		? resolveAbsolutePath(normalizedInput, platform)
		: resolve(baseDir, normalizedInput);
}

function normalizeComparablePath(input: string): string {
	return stripTrailingSlashes(normalizeSeparators(resolveUserPath(input)));
}

function isWithinProjectRoot(candidate: string, projectRoot: string): boolean {
	const normalizedCandidate = normalizeComparablePath(candidate);
	const normalizedProjectRoot = normalizeComparablePath(projectRoot);
	return (
		normalizedCandidate === normalizedProjectRoot ||
		normalizedCandidate.startsWith(`${normalizedProjectRoot}/`)
	);
}

function getLowercaseBasename(input: string): string {
	const normalizedInput = normalizeSeparators(input);
	return normalizedInput.split("/").pop()!.toLowerCase();
}

function getLookupKey(input: string, isBareFilename: boolean): string {
	return isBareFilename ? getLowercaseBasename(input) : input.toLowerCase();
}

function resolveAbsolutePath(
	input: string,
	platform = process.platform,
): string {
	// Use win32.resolve for Windows paths regardless of reported platform
	return platform === "win32" || hasWindowsDriveLetter(input)
		? win32.resolve(input)
		: resolve(input);
}

/**
 * The set of files single-file annotate resolution accepts. Wider than
 * markdown proper: any unambiguously plain-text format renders the
 * way .txt does, plus the user's configured extra markdown extensions
 *. HTML is refused.
 */
function isSearchableMarkdownPath(input: string, extra: readonly string[]): boolean {
	return buildAnnotatableTextRegex(extra).test(input.trim());
}

/** Check if a path looks like a Windows absolute path (e.g. C:\ or C:/) */
function hasWindowsDriveLetter(input: string): boolean {
	return /^[a-zA-Z]:[/\\]/.test(input);
}

/** Cross-platform file existence check using Node fs (more reliable than Bun.file in compiled exes) */
function fileExists(filePath: string): boolean {
	try {
		return existsSync(filePath);
	} catch {
		return false;
	}
}

type FileWalkState = {
	visitedFiles: number;
	readonly limit: number;
};

/** Recursively walk a directory collecting files matching `fileMatcher`, skipping ignored dirs. */
function walkFiles(
	dir: string,
	root: string,
	results: string[],
	ignoredDirs: string[],
	fileMatcher: (name: string) => boolean,
	state: FileWalkState,
): void {
	if (state.visitedFiles >= state.limit) return;
	const entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
	for (const entry of entries) {
		if (state.visitedFiles >= state.limit) return;
		if (entry.isDirectory()) {
			if (ignoredDirs.some((d) => d === entry.name + "/")) continue;
			try {
				walkFiles(
					join(dir, entry.name),
					root,
					results,
					ignoredDirs,
					fileMatcher,
					state,
				);
			} catch {
				/* skip dirs we can't read */
			}
		} else if (entry.isFile()) {
			state.visitedFiles += 1;
			if (fileMatcher(entry.name)) {
				const relative = join(dir, entry.name)
					.slice(root.length + 1)
					.replace(/\\/g, "/");
				results.push(relative);
			}
		}
	}
}

function walkMarkdownFiles(
	dir: string,
	root: string,
	results: string[],
	ignoredDirs: string[],
	extra: readonly string[],
): void {
	const matcher = buildAnnotatableTextRegex(extra);
	try {
		walkFiles(
			dir,
			root,
			results,
			ignoredDirs,
			(name) => matcher.test(name),
			{ visitedFiles: 0, limit: getFileBrowserMaxFiles() },
		);
	} catch {
		/* fail soft for markdown — preserves existing behavior */
	}
}

/**
 * Resolve a markdown file path within a project root.
 *
 * @param input - User-provided path (absolute, relative, or bare filename)
 * @param projectRoot - Project root directory to search within
 */
function resolveMarkdownFileCore(
	input: string,
	projectRoot: string,
	extra: readonly string[],
): ResolveResult {
	const normalizedInput = normalizeUserPathInput(input);
	const searchInput = normalizeSeparators(normalizedInput);
	const isBareFilename = !searchInput.includes("/");
	const targetLookupKey = getLookupKey(searchInput, isBareFilename);

	// Restrict to annotatable plain-text files (markdown + config formats)
	if (!isSearchableMarkdownPath(normalizedInput, extra)) {
		return { kind: "not_found", input };
	}

	// 1. Absolute path — use as-is (no project root restriction;
	//    the user explicitly typed the full path)
	if (isAbsoluteNormalizedUserPath(normalizedInput)) {
		const absolutePath = resolveAbsolutePath(normalizedInput);
		if (fileExists(absolutePath)) {
			return { kind: "found", path: absolutePath };
		}
		return { kind: "not_found", input };
	}

	// 2. Exact relative path from project root. An explicit path the user
	//    typed (one containing a separator, including `../` that escapes the
	//    root) is honored when it exists — the same trust already extended to
	//    absolute paths above. Bare filenames stay restricted to the fuzzy
	//    in-root search below so a stray `notes.md` can't resolve to a parent.
	const fromRoot = resolve(projectRoot, searchInput);
	if (
		fileExists(fromRoot) &&
		(isWithinProjectRoot(fromRoot, projectRoot) || searchInput.includes("/"))
	) {
		return { kind: "found", path: fromRoot };
	}

	// 3. Case-insensitive search (only scan markdown files)
	const allFiles: string[] = [];
	walkMarkdownFiles(projectRoot, projectRoot, allFiles, IGNORED_DIRS, extra);
	const matches: string[] = [];

	for (const match of allFiles) {
		const normalizedMatch = normalizeSeparators(match);
		const matchLookupKey = getLookupKey(normalizedMatch, isBareFilename);

		if (matchLookupKey === targetLookupKey) {
			const full = resolve(projectRoot, normalizedMatch);
			if (isWithinProjectRoot(full, projectRoot)) {
				matches.push(full);
			}
		}
	}

	if (matches.length === 1) {
		return { kind: "found", path: matches[0] };
	}
	if (matches.length > 1) {
		const projectRootPrefix = `${normalizeComparablePath(projectRoot)}/`;
		const relative = matches.map((match) =>
			normalizeComparablePath(match).replace(projectRootPrefix, ""),
		);
		return { kind: "ambiguous", input, matches: relative };
	}

	return { kind: "not_found", input };
}

/**
 * Resolve a markdown file path within a project root.
 *
 * @param input - User-provided path (absolute, relative, or bare filename)
 * @param projectRoot - Project root directory to search within
 * @param options.extraMarkdownExtensions - Configured extra markdown
 *   extensions. Defaults to the process-wide set resolved from
 *   `config.json`; pass an explicit list to resolve against a specific one.
 */
export function resolveMarkdownFile(
	input: string,
	projectRoot: string,
	options?: { extraMarkdownExtensions?: readonly string[] },
): ResolveResult {
	const originalInput = input.trim();
	const unquotedInput = stripWrappingQuotes(originalInput);
	const extra = options?.extraMarkdownExtensions ?? getExtraMarkdownExtensions();

	const primary = resolveMarkdownFileCore(unquotedInput, projectRoot, extra);
	if (primary.kind === "found") {
		return primary;
	}
	if (primary.kind === "ambiguous") {
		return { ...primary, input: originalInput };
	}

	if (!unquotedInput.startsWith("@")) {
		return { kind: "not_found", input: originalInput };
	}

	const normalizedInput = unquotedInput.replace(/^@+/, "");
	if (!normalizedInput) {
		return { kind: "not_found", input: originalInput };
	}

	const fallback = resolveMarkdownFileCore(normalizedInput, projectRoot, extra);
	if (fallback.kind === "found") {
		return fallback;
	}
	if (fallback.kind === "ambiguous") {
		return { ...fallback, input: originalInput };
	}

	return { kind: "not_found", input: originalInput };
}
