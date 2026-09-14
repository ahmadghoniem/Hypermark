import { realpathSync } from "fs";
import { dirname } from "path";
import { resolveUserPath } from "./resolve-file";

export interface AnnotateReferenceRootOptions {
	mode?: string;
	filePath: string;
	initialSingleFileSourcePath?: string | null;
}

export function getAnnotateReferenceRootPaths(options: AnnotateReferenceRootOptions): string[] {
	const roots: string[] = [];
	const addRoot = (root: string | null | undefined) => {
		if (!root) return;
		const resolved = resolveUserPath(root);
		if (!roots.includes(resolved)) roots.push(resolved);
		try {
			const real = realpathSync(resolved);
			if (!roots.includes(real)) roots.push(real);
		} catch {
			/* Missing source paths still contribute their lexical parent. */
		}
	};

	addRoot(process.cwd());
	addRoot(dirname(options.filePath));
	addRoot(options.initialSingleFileSourcePath ? dirname(options.initialSingleFileSourcePath) : null);
	return roots;
}
