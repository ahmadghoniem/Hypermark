/**
 * Spec 02 step 5 — no-outbound fixture test.
 *
 * The paste-service share transport (share-url.ts, POST /api/paste to
 * plannotator-paste.plannotator.workers.dev, and the share.plannotator.ai
 * link format) has been removed. This is a cheap static-source guard, not a
 * live network test: it fails if any of those symbols/hosts creep back into
 * the retained packages/server source, which is the only way this transport
 * could resurface without a caller anywhere producing sharingEnabled /
 * shareBaseUrl / pasteApiUrl options (those were removed from
 * review.ts/annotate.ts/index.ts).
 */
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SERVER_DIR = import.meta.dir;

// Literals that would only appear if the removed paste-service transport (or
// a caller of it) crept back into the retained server surface.
const FORBIDDEN_PATTERNS: RegExp[] = [
  /plannotator-paste/i,
  /share\.plannotator\.ai/i,
  /writeRemoteShareLink/,
  /generateRemoteShareUrl/,
  /\/api\/paste\b/,
];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith(".test.ts")) continue;
    out.push(join(dir, entry.name));
  }
  return out;
}

describe("no outbound share/paste transport", () => {
  test("share-url.ts (the paste-service transport) no longer exists", () => {
    expect(existsSync(join(SERVER_DIR, "share-url.ts"))).toBe(false);
  });

  test("no retained server source references the removed paste-service transport", () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(SERVER_DIR)) {
      const content = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) offenders.push(`${file}: matched ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
