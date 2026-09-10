/**
 * Search-based code navigation — shared types and pure logic.
 *
 * Runtime-agnostic: both Bun and Node servers provide their own
 * CodeNavRuntime implementation to run subprocess commands.
 */

function validateFilePath(filePath: string): void {
  if (filePath.includes("..") || filePath.startsWith("/")) {
    throw new Error("Invalid file path");
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeNavRequest {
  symbol: string;
  filePath: string;
  line: number;
  charStart: number;
  side: "old" | "new";
  language?: string;
}

export interface CodeNavLocation {
  kind: "definition" | "reference";
  confidence: "likely" | "possible";
  filePath: string;
  line: number;
  column: number;
  snippet: string;
}

export interface CodeNavResponse {
  backend: "search" | "unavailable";
  complete: boolean;
  definitions: CodeNavLocation[];
  references: CodeNavLocation[];
  stats: { elapsedMs: number; capped: boolean };
  searchScope: "head";
}

export interface CodeNavRuntime {
  runCommand: (
    command: string,
    args: string[],
    options?: { cwd?: string; timeoutMs?: number },
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  /**
   * Read one repo-relative file for hover enrichment. Optional so the vendored
   * type stays backward compatible and `/resolve` callers never provide it —
   * without it hover degrades to the definition location plus references.
   *
   * Implementations must return `null` (never throw) for a missing or
   * unreadable file, and for one larger than CODE_NAV_MAX_FILE_BYTES — the
   * ceiling rg itself searches under (`--max-filesize 1M`).
   */
  readFile?: (
    path: string,
    options?: { cwd?: string },
  ) => Promise<string | null>;
}

/**
 * What a definition regex matched. Tier 0 reads it off the pattern that fired;
 * later tiers fill it from an AST or an index.
 */
export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "const"
  | "variable"
  | "struct"
  | "trait"
  | "module";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CODE_NAV_IGNORED_GLOBS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".turbo",
  ".cache",
  "target",
  "vendor",
  "coverage",
  ".venv",
  ".pytest_cache",
];

const RG_TYPE_MAP: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  go: "go",
  rust: "rust",
  java: "java",
  ruby: "ruby",
  cpp: "cpp",
  c: "c",
};

// ---------------------------------------------------------------------------
// Definition patterns
// ---------------------------------------------------------------------------

/**
 * Each pattern carries the kind it proves. Alternations that used to span
 * several kinds (`const|let|var`, `interface|type`, go's optional receiver)
 * are split one-per-kind: the union of the patterns is unchanged, so
 * definition-vs-reference classification is identical, but a match now also
 * names WHAT was defined.
 */
interface DefinitionPattern {
  pattern: string;
  kind: SymbolKind;
}

interface DefinitionPatternSet {
  languages: string[];
  patterns: DefinitionPattern[];
}

const DEFINITION_PATTERNS: DefinitionPatternSet[] = [
  {
    languages: ["typescript", "javascript"],
    patterns: [
      { pattern: String.raw`(?:export\s+)?(?:async\s+)?function\s+SYMBOL\b`, kind: "function" },
      { pattern: String.raw`(?:export\s+)?const\s+SYMBOL\s*[=:]`, kind: "const" },
      { pattern: String.raw`(?:export\s+)?(?:let|var)\s+SYMBOL\s*[=:]`, kind: "variable" },
      { pattern: String.raw`(?:export\s+)?class\s+SYMBOL\b`, kind: "class" },
      { pattern: String.raw`(?:export\s+)?interface\s+SYMBOL\b`, kind: "interface" },
      { pattern: String.raw`(?:export\s+)?type\s+SYMBOL\b`, kind: "type" },
      { pattern: String.raw`(?:export\s+)?enum\s+SYMBOL\b`, kind: "enum" },
      {
        pattern: String.raw`^\s+(?:(?:async|static|readonly|get|set|private|protected|public)\s+)+SYMBOL\s*[(<:]`,
        kind: "method",
      },
    ],
  },
  {
    languages: ["python"],
    patterns: [
      { pattern: String.raw`(?:^|\s)def\s+SYMBOL\s*\(`, kind: "function" },
      { pattern: String.raw`(?:^|\s)class\s+SYMBOL\b`, kind: "class" },
      { pattern: String.raw`^SYMBOL\s*=`, kind: "variable" },
    ],
  },
  {
    languages: ["go"],
    patterns: [
      { pattern: String.raw`func\s+\([^)]+\)\s+SYMBOL\s*\(`, kind: "method" },
      { pattern: String.raw`func\s+SYMBOL\s*\(`, kind: "function" },
      { pattern: String.raw`type\s+SYMBOL\s`, kind: "type" },
      { pattern: String.raw`var\s+SYMBOL\s`, kind: "variable" },
    ],
  },
  {
    languages: ["rust"],
    patterns: [
      { pattern: String.raw`(?:pub(?:\([^)]*\))?\s+)?fn\s+SYMBOL\b`, kind: "function" },
      { pattern: String.raw`(?:pub(?:\([^)]*\))?\s+)?struct\s+SYMBOL\b`, kind: "struct" },
      { pattern: String.raw`(?:pub(?:\([^)]*\))?\s+)?enum\s+SYMBOL\b`, kind: "enum" },
      { pattern: String.raw`(?:pub(?:\([^)]*\))?\s+)?trait\s+SYMBOL\b`, kind: "trait" },
      { pattern: String.raw`(?:pub(?:\([^)]*\))?\s+)?type\s+SYMBOL\b`, kind: "type" },
      { pattern: String.raw`(?:pub(?:\([^)]*\))?\s+)?mod\s+SYMBOL\b`, kind: "module" },
    ],
  },
];

const GENERIC_DEFINITION_PATTERNS: DefinitionPattern[] = [
  { pattern: String.raw`(?:function|def|func|fn)\s+SYMBOL\b`, kind: "function" },
  { pattern: String.raw`class\s+SYMBOL\b`, kind: "class" },
  { pattern: String.raw`struct\s+SYMBOL\b`, kind: "struct" },
  { pattern: String.raw`enum\s+SYMBOL\b`, kind: "enum" },
  { pattern: String.raw`trait\s+SYMBOL\b`, kind: "trait" },
  { pattern: String.raw`interface\s+SYMBOL\b`, kind: "interface" },
  { pattern: String.raw`type\s+SYMBOL\b`, kind: "type" },
  { pattern: String.raw`const\s+SYMBOL\s*[=:]`, kind: "const" },
  { pattern: String.raw`(?:let|var|val)\s+SYMBOL\s*[=:]`, kind: "variable" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sameDirectory(a: string, b: string): boolean {
  const dirA = a.lastIndexOf("/");
  const dirB = b.lastIndexOf("/");
  if (dirA === -1 && dirB === -1) return true;
  return a.slice(0, dirA) === b.slice(0, dirB);
}

function isTestFile(filePath: string): boolean {
  return /(?:test|spec|__tests__|_test\.|\.test\.|\.spec\.)/i.test(filePath);
}

// ---------------------------------------------------------------------------
// rg argument construction
// ---------------------------------------------------------------------------

export function buildRgArgs(symbol: string, language?: string): string[] {
  const args: string[] = [
    "--json",
    "--line-number",
    "--column",
    "--max-count",
    "50",
    "--max-filesize",
    "1M",
    "--no-messages",
  ];

  for (const dir of CODE_NAV_IGNORED_GLOBS) {
    args.push("--glob", `!${dir}`);
  }

  if (language) {
    const rgType = RG_TYPE_MAP[language];
    if (rgType) args.push("--type", rgType);
  }

  args.push("--word-regexp", "--", escapeRegex(symbol), ".");

  return args;
}

// ---------------------------------------------------------------------------
// rg JSON output parsing
// ---------------------------------------------------------------------------

interface RgMatchData {
  path: { text: string };
  lines: { text: string };
  line_number: number;
  submatches: Array<{ start: number; end: number }>;
}

const PARSE_CAP = 500;

export function parseRgJsonOutput(
  stdout: string,
  symbol: string,
  language?: string,
): CodeNavLocation[] {
  const locations: CodeNavLocation[] = [];
  const lines = stdout.split("\n");

  for (const line of lines) {
    if (locations.length >= PARSE_CAP) break;
    if (!line.trim()) continue;

    let parsed: { type: string; data: RgMatchData };
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.type !== "match") continue;

    const d = parsed.data;
    const snippet = d.lines.text.trimEnd();
    const column = d.submatches?.[0]?.start ?? 0;
    const kind = classifyMatch(snippet, symbol, language);
    // ripgrep prints "./pay.js" on POSIX and ".\pay.js" on Windows. Both must
    // reduce to the same repo-relative identity the diff and tree key on.
    const filePath = d.path.text.replace(/\\/g, "/").replace(/^\.\//, "");

    locations.push({
      kind,
      confidence: kind === "definition" ? "likely" : "possible",
      filePath,
      line: d.line_number,
      column,
      snippet: snippet.length > 200 ? snippet.slice(0, 200) + "…" : snippet,
    });
  }

  return locations;
}

// ---------------------------------------------------------------------------
// Match classification
// ---------------------------------------------------------------------------

/**
 * Same decision as {@link classifyMatch}, but it also reports WHICH pattern
 * fired. The kind is free information the classifier already computed and
 * used to throw away; the hover card renders it as a badge.
 */
export function classifyMatchDetailed(
  snippet: string,
  symbol: string,
  language?: string,
): { kind: "definition" | "reference"; symbolKind: SymbolKind | null } {
  const escaped = escapeRegex(symbol);

  if (language) {
    const langPatterns = DEFINITION_PATTERNS.find((p) =>
      p.languages.includes(language),
    );
    if (langPatterns) {
      for (const { pattern, kind } of langPatterns.patterns) {
        const re = new RegExp(pattern.replace("SYMBOL", escaped));
        if (re.test(snippet)) return { kind: "definition", symbolKind: kind };
      }
    }
  }

  for (const { pattern, kind } of GENERIC_DEFINITION_PATTERNS) {
    const re = new RegExp(pattern.replace("SYMBOL", escaped));
    if (re.test(snippet)) return { kind: "definition", symbolKind: kind };
  }

  return { kind: "reference", symbolKind: null };
}

export function classifyMatch(
  snippet: string,
  symbol: string,
  language?: string,
): "definition" | "reference" {
  return classifyMatchDetailed(snippet, symbol, language).kind;
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export function rankLocations(
  locations: CodeNavLocation[],
  context: {
    sourceFilePath: string;
    changedFiles: string[];
    isTestFile: boolean;
  },
  cap = 50,
): { definitions: CodeNavLocation[]; references: CodeNavLocation[]; capped: boolean } {
  const capped = locations.length > cap;
  const changedSet = new Set(context.changedFiles);

  function score(loc: CodeNavLocation): number {
    let s = 0;

    if (loc.filePath === context.sourceFilePath) s += 1000;
    else if (changedSet.has(loc.filePath)) s += 500;
    else if (sameDirectory(loc.filePath, context.sourceFilePath)) s += 200;

    if (isTestFile(loc.filePath) && !context.isTestFile) s -= 300;

    if (loc.kind === "definition") s += 100;
    if (loc.confidence === "likely") s += 50;

    return s;
  }

  const sorted = [...locations].sort((a, b) => score(b) - score(a));
  const truncated = sorted.slice(0, cap);

  return {
    definitions: truncated.filter((l) => l.kind === "definition"),
    references: truncated.filter((l) => l.kind === "reference"),
    capped,
  };
}

// ---------------------------------------------------------------------------
// Changed files extraction from unified diff patch
// ---------------------------------------------------------------------------

export function extractChangedFiles(patch: string | null): string[] {
  if (!patch) return [];
  const set = new Set<string>();
  const re = /^diff --git a\/(.+?) b\/(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(patch)) !== null) {
    set.add(m[1]);
    set.add(m[2]);
  }
  return [...set];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateCodeNavRequest(
  body: unknown,
): string | null {
  if (!body || typeof body !== "object") return "Invalid request body";
  const b = body as Record<string, unknown>;

  if (typeof b.symbol !== "string" || !b.symbol.trim()) {
    return "Missing or empty symbol";
  }
  if (typeof b.filePath !== "string" || !b.filePath.trim()) {
    return "Missing filePath";
  }
  try {
    validateFilePath(b.filePath as string);
  } catch {
    return "Invalid filePath";
  }
  if (b.side !== "old" && b.side !== "new") {
    return "side must be 'old' or 'new'";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

let rgAvailable: boolean | null = null;

export async function resolveCodeNav(
  runtime: CodeNavRuntime,
  request: CodeNavRequest,
  cwd: string,
  changedFiles: string[],
  /**
   * Additive: hover passes a shorter timeout than Cmd+click's 5s, because a
   * 5s hover answer is useless. `/resolve` keeps the original default.
   */
  options?: { timeoutMs?: number },
): Promise<CodeNavResponse> {
  const start = Date.now();

  if (rgAvailable === null) {
    const check = await runtime.runCommand("rg", ["--version"], {
      cwd,
      timeoutMs: 2000,
    });
    rgAvailable = check.exitCode === 0;
  }

  if (!rgAvailable) {
    return {
      backend: "unavailable",
      complete: true,
      definitions: [],
      references: [],
      searchScope: "head",
      stats: { elapsedMs: Date.now() - start, capped: false },
    };
  }

  const args = buildRgArgs(request.symbol, request.language);

  const result = await runtime.runCommand("rg", args, {
    cwd,
    timeoutMs: options?.timeoutMs ?? 5000,
  });

  // Exit code 1 = no matches (normal), exit code 2 = error
  if (result.exitCode === 2) {
    return {
      backend: "search",
      complete: true,
      definitions: [],
      references: [],
      searchScope: "head",
      stats: { elapsedMs: Date.now() - start, capped: false },
    };
  }

  const locations = parseRgJsonOutput(
    result.stdout,
    request.symbol,
    request.language,
  );

  const ranked = rankLocations(locations, {
    sourceFilePath: request.filePath,
    changedFiles,
    isTestFile: isTestFile(request.filePath),
  });

  return {
    backend: "search",
    complete: true,
    definitions: ranked.definitions,
    references: ranked.references,
    searchScope: "head",
    stats: { elapsedMs: Date.now() - start, capped: ranked.capped },
  };
}

export function resetRgCache(): void {
  rgAvailable = null;
}

/** Mirrors rg's own `--max-filesize 1M`: never read what rg would not search. */
export const CODE_NAV_MAX_FILE_BYTES = 1024 * 1024;
