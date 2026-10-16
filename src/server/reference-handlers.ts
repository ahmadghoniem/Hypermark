/**
 * Reference/document route handlers for the plan server.
 *
 * Handles /api/doc. Extracted from index.ts for modularity.
 */

import {
	isAbsoluteUserPath,
	resolveMarkdownFile,
	resolveUserPath,
	isWithinProjectRoot,
	getAnnotatableDocRegex,
	MAX_ANNOTATABLE_FILE_BYTES,
} from "@/shared/resolve-file";
import { realpathSync } from "node:fs";
import { htmlToMarkdown } from "@/shared/html-to-markdown";

// --- Route handlers ---

export interface HandleDocOptions {
	rootPaths?: string[];
}


type RouteResolveResult =
	| { kind: "found"; path: string }
	| { kind: "not_found"; input: string }
	| { kind: "ambiguous"; input: string; matches: string[] }
	| { kind: "unavailable"; input: string };

function getAllowedRootPaths(options?: { rootPath?: string; rootPaths?: string[] }): string[] {
	const rawRoots = options?.rootPaths?.length
		? options.rootPaths
		: [options?.rootPath ?? process.cwd()];
	const roots: string[] = [];
	for (const root of rawRoots) {
		if (typeof root !== "string" || root.length === 0) continue;
		const resolved = resolveUserPath(root);
		if (!roots.includes(resolved)) roots.push(resolved);
	}
	return roots.length > 0 ? roots : [resolveUserPath(process.cwd())];
}

function isWithinAllowedRoots(candidate: string, roots: string[]): boolean {
	return roots.some((root) => isWithinProjectRoot(candidate, root));
}

/**
 * The containment checks above are lexical, so a symlink inside a root can
 * point at a file outside it. Run before every read: the file's real path
 * must sit inside a root's real path. A path that does not exist passes, and
 * the read that follows finds nothing.
 */
function isRealPathWithinAllowedRoots(candidate: string, roots: string[]): boolean {
	let real: string;
	try {
		real = realpathSync(candidate);
	} catch {
		return true;
	}
	return roots.some((root) => {
		let realRoot = root;
		try {
			realRoot = realpathSync(root);
		} catch { /* keep the lexical root */ }
		return isWithinProjectRoot(real, realRoot);
	});
}

function accessDenied(): Response {
	return Response.json({ error: "Access denied: path is outside project root" }, { status: 403 });
}

function getTrustedBaseDir(base: string | null, roots: string[]): string | null {
	if (!base) return null;
	const resolvedBase = resolveUserPath(base);
	return isWithinAllowedRoots(resolvedBase, roots) ? resolvedBase : null;
}

export type ResolveAllowedDocPathResult =
	| { kind: "resolved"; path: string }
	| { kind: "denied" };

/**
 * Resolve a client-supplied path the same way /api/doc's base-relative and
 * absolute branches do (see `getTrustedBaseDir` / `isWithinAllowedRoots`
 * above), for callers that need the canonical contained path without
 * reading the file — namely the annotate version endpoints, which derive a
 * history slug from the resolved path rather than trusting a client-supplied
 * slug (a client slug would be a path-traversal vector: `getHistoryDir`
 * joins it into a filesystem path unsanitized).
 */
export function resolveAllowedDocPath(
	requestedPath: string,
	base: string | null,
	options?: { rootPaths?: string[] },
): ResolveAllowedDocPathResult {
	const allowedRoots = getAllowedRootPaths(options);
	const resolvedBase = getTrustedBaseDir(base, allowedRoots);
	const candidate = resolveUserPath(requestedPath, resolvedBase ?? undefined);
	return isWithinAllowedRoots(candidate, allowedRoots)
		? { kind: "resolved", path: candidate }
		: { kind: "denied" };
}

function relativizeToAllowedRoots(path: string, roots: string[]): string {
	for (const root of roots) {
		const prefix = `${root}/`;
		if (path.startsWith(prefix)) return path.slice(prefix.length);
		if (path === root) return ".";
	}
	return path;
}

function resolveMarkdownFileFromAllowedRoots(input: string, roots: string[]): RouteResolveResult {
	const found = new Set<string>();
	const ambiguous = new Set<string>();
	let unavailable = false;

	for (const root of roots) {
		const result = resolveMarkdownFile(input, root);
		if (result.kind === "found") {
			if (isWithinProjectRoot(result.path, root)) found.add(result.path);
		} else if (result.kind === "ambiguous") {
			for (const match of result.matches) {
				ambiguous.add(match);
			}
		} else if (result.kind === "unavailable") {
			unavailable = true;
		}
	}

	if (found.size === 1) return { kind: "found", path: [...found][0] };
	if (found.size > 1) return { kind: "ambiguous", input, matches: [...found] };
	if (ambiguous.size > 0) return { kind: "ambiguous", input, matches: [...ambiguous] };
	if (unavailable) return { kind: "unavailable", input };
	return { kind: "not_found", input };
}

/** Serve a linked markdown document. Resolves absolute, relative, or bare filename paths. */
export async function handleDoc(req: Request, options: HandleDocOptions = {}): Promise<Response> {
	const url = new URL(req.url);
	const requestedPath = url.searchParams.get("path");
	if (!requestedPath) {
		return Response.json({ error: "Missing path parameter" }, { status: 400 });
	}

	const allowedRoots = getAllowedRootPaths(options);
	// If a base directory is provided, try resolving relative to it first
	// (used by annotate mode to resolve paths relative to the source file).
	const base = url.searchParams.get("base");
	const resolvedBase = getTrustedBaseDir(base, allowedRoots);
	const docExtensions = getAnnotatableDocRegex();
	if (
		resolvedBase &&
		!isAbsoluteUserPath(requestedPath) &&
		docExtensions.test(requestedPath)
	) {
		const fromBase = resolveUserPath(requestedPath, resolvedBase);
		if (
			!isWithinAllowedRoots(fromBase, allowedRoots) ||
			!isRealPathWithinAllowedRoots(fromBase, allowedRoots)
		) {
			return accessDenied();
		}
		try {
			const file = Bun.file(fromBase);
			if (await file.exists()) {
				if (file.size > MAX_ANNOTATABLE_FILE_BYTES) {
					return Response.json({ error: "File too large (max 2MB)" }, { status: 413 });
				}
				const raw = await file.text();
				const isHtml = /\.html?$/i.test(requestedPath);
				const markdown = isHtml ? htmlToMarkdown(raw) : raw;
				return Response.json({ markdown, filepath: fromBase, isConverted: isHtml });
			}
		} catch {
			/* fall through to standard resolution */
		}
	}

	// HTML files: resolve directly (not via resolveMarkdownFile which only handles .md/.mdx)
	const projectRoot = allowedRoots[0];
	if (/\.html?$/i.test(requestedPath)) {
		const resolvedHtml = resolveUserPath(requestedPath, resolvedBase || projectRoot);
		if (
			!isWithinAllowedRoots(resolvedHtml, allowedRoots) ||
			!isRealPathWithinAllowedRoots(resolvedHtml, allowedRoots)
		) {
			return accessDenied();
		}
		try {
			const file = Bun.file(resolvedHtml);
			if (await file.exists()) {
				const markdown = htmlToMarkdown(await file.text());
				return Response.json({ markdown, filepath: resolvedHtml, isConverted: true });
			}
		} catch { /* fall through */ }
		return Response.json({ error: `File not found: ${requestedPath}` }, { status: 404 });
	}

	if (isAbsoluteUserPath(requestedPath) && !isWithinAllowedRoots(resolveUserPath(requestedPath), allowedRoots)) {
		return accessDenied();
	}
	const result = resolveMarkdownFileFromAllowedRoots(requestedPath, allowedRoots);

	if (result.kind === "ambiguous") {
		return Response.json(
			{
				error: `Ambiguous filename '${result.input}': found ${result.matches.length} matches`,
				matches: result.matches.map((m) => relativizeToAllowedRoots(m, allowedRoots)),
			},
			{ status: 400 },
		);
	}

	if (result.kind === "unavailable") {
		return Response.json(
			{ error: `Cannot scan project: ${result.input}`, reason: "unavailable" },
			{ status: 503 },
		);
	}

	if (result.kind === "not_found") {
		return Response.json(
			{ error: `File not found: ${result.input}` },
			{ status: 404 },
		);
	}

	if (!isRealPathWithinAllowedRoots(result.path, allowedRoots)) {
		return accessDenied();
	}

	try {
		const file = Bun.file(result.path);
		if (file.size > MAX_ANNOTATABLE_FILE_BYTES) {
			return Response.json({ error: "File too large (max 2MB)" }, { status: 413 });
		}
		const markdown = await file.text();
		return Response.json({ markdown, filepath: result.path });
	} catch {
		return Response.json({ error: "Failed to read file" }, { status: 500 });
	}
}
