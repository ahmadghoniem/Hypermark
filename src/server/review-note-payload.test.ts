/**
 * The review-level note ("Send with additional feedback") rides the EXISTING
 * /api/feedback payload: one extra `scope: 'general'` entry in the annotations
 * array plus a `## General` section already inside the feedback markdown. That
 * is the whole reason the feature needs no server change.
 *
 * Regression guarded: a future body validator, field whitelist, or
 * CodeAnnotation schema landing on either runtime's /api/feedback handler and
 * silently dropping (or rewriting) an annotation entry it does not recognise —
 * which would deliver the reviewer's note nowhere while still reporting 200.
 * Also guarded: the archive's hasContent computation demoting a note-carrying
 * submission to a decision-only line.
 *
 * Both runtimes are exercised in one file (precedent: api-404-guard.test.ts).
 * Every server here runs under a temp HYPERMARK_DATA_DIR set inside the test
 * body; the archive is opted back in per test and restored afterwards.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startReviewServer as startBunReviewServer } from "./review";
import { getVcsContext } from "./vcs";
import { parseFeedbackIndex } from "@/shared/feedback-archive";

const MINIMAL_HTML = "<html><body>Hypermark</body></html>";
const PATCH = "diff --git a/src/parse.ts b/src/parse.ts\n@@ -1 +1 @@\n-a\n+b\n";

const NOTE_TEXT = "Rebase on main before merging; the migration should be its own PR.";
const FEEDBACK = `# Code Review Feedback\n\n## src/parse.ts\n\n- L1: still drops null\n\n## General\n\n${NOTE_TEXT}\n`;

/** Exactly what the client commits for a review-level note. */
const NOTE = {
  id: "review-note-1",
  type: "comment",
  scope: "general",
  filePath: "",
  lineStart: 0,
  lineEnd: 0,
  side: "new",
  text: NOTE_TEXT,
  createdAt: 1735689600000,
} as const;

const LINE_COMMENT = {
  id: "c1",
  type: "comment",
  filePath: "src/parse.ts",
  lineStart: 1,
  lineEnd: 1,
  side: "new",
  text: "still drops null",
  createdAt: 1735689500000,
} as const;

const tempDirs: string[] = [];
const savedEnv: Record<string, string | undefined> = {};

function saveEnv(key: string) {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
}

function useTempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hypermark-review-note-"));
  tempDirs.push(dir);
  saveEnv("HYPERMARK_DATA_DIR");
  process.env.HYPERMARK_DATA_DIR = dir;
  return dir;
}

function enableArchive() {
  saveEnv("HYPERMARK_FEEDBACK_HISTORY");
  process.env.HYPERMARK_FEEDBACK_HISTORY = "1";
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete savedEnv[key];
  }
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } catch {
      // Windows can hold a transient handle on a just-used temp git repo; the OS
      // reclaims it. Teardown noise must not fail a passing assertion.
    }
  }
});

interface RunningReview {
  url: string;
  stop(): void;
  waitForDecision(): Promise<{
    approved: boolean;
    feedback: string;
    annotations: unknown[];
  }>;
}

const runtimes: Array<{ name: string; start: () => Promise<RunningReview> }> = [
  {
    name: "Bun review",
    start: () =>
      startBunReviewServer({
        rawPatch: PATCH,
        gitRef: "HEAD",
        origin: "claude-code",
        htmlContent: MINIMAL_HTML,
      }) as unknown as Promise<RunningReview>,
  },
];

async function postFeedback(url: string, annotations: readonly unknown[]) {
  return fetch(`${url}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved: false, feedback: FEEDBACK, annotations }),
  });
}

for (const runtime of runtimes) {
  describe(`review-level note payload (${runtime.name})`, () => {
    test("the note reaches waitForDecision unmodified, with the feedback byte-identical", async () => {
      useTempDataDir();
      const server = await runtime.start();
      try {
        const decision = server.waitForDecision();
        const response = await postFeedback(server.url, [LINE_COMMENT, NOTE]);
        expect(response.status).toBe(200);

        const result = await decision;
        expect(result.approved).toBe(false);
        // Byte-identical: the ## General section the note lives in is what the
        // agent actually reads.
        expect(result.feedback).toBe(FEEDBACK);
        expect(result.annotations.length).toBe(2);
        // Deep-equal, so a dropped `scope` or a rewritten sentinel path fails.
        expect(result.annotations[1]).toEqual(NOTE);
      } finally {
        server.stop();
      }
    });

    test("a note-carrying submission archives as a feedback decision that counts the note", async () => {
      const dataDir = useTempDataDir();
      enableArchive();
      const server = await runtime.start();
      try {
        const decision = server.waitForDecision();
        expect((await postFeedback(server.url, [LINE_COMMENT, NOTE])).status).toBe(200);
        await decision;

        const projects = readdirSync(join(dataDir, "feedback"));
        expect(projects.length).toBe(1);
        const records = parseFeedbackIndex(
          readFileSync(join(dataDir, "feedback", projects[0], "index.jsonl"), "utf-8"),
        );
        expect(records.length).toBe(1);
        expect(records[0].decision).toBe("feedback");
        expect(records[0].counts.annotations).toBe(2);
        // Maintainer ruling (open question 2): the archived record must carry
        // the note's `scope` so a review-level general comment is
        // distinguishable from a line comment in index.jsonl. Additive field —
        // the line comment stays scope-free (the pre-scope default).
        const archived = records[0].annotations ?? [];
        expect(archived.find((a) => a.id === NOTE.id)?.scope).toBe("general");
        expect(archived.find((a) => a.id === LINE_COMMENT.id)?.scope).toBeUndefined();
        // The sidecar exists and carries the note's text, so a submission whose
        // only content is a review-level note is recoverable from disk.
        expect(records[0].recordFile).toBeTruthy();
        const sidecar = readFileSync(
          join(dataDir, "feedback", projects[0], records[0].recordFile as string),
          "utf-8",
        );
        expect(sidecar).toContain(NOTE_TEXT);
      } finally {
        server.stop();
      }
    });
  });
}

/**
 * Approve-with-notes delivery — server half, Bun runtime.
 *
 * Guards three regressions:
 *  1. Advert honesty: a server booted WITHOUT `approvalNotesSupported`
 *     advertises `false` on /api/diff — an old caller (a consumer whose
 *     approved branch still discards feedback) must never read as capable,
 *     or the client renders approve-carrying items whose notes are dropped.
 *  2. Advert survival: the advert rides /api/diff/switch too. If a switch
 *     response stopped carrying it, a client that re-derives state from the
 *     payload would silently lose the approve-carrying menu items after a
 *     diff switch.
 *  3. Delivery + archive: an approval carrying feedback reaches
 *     waitForDecision unmodified and archives as `approved-with-notes`;
 *     a bare approval (`feedback: ''`, no annotations — the post-placeholder
 *     client shape) archives as `lgtm` with NO sidecar. The `lgtm` decision
 *     was unreachable while the client sent the LGTM placeholder; this pins
 *     that it stays reachable.
 */
describe("approve with notes", () => {
  const MINIMAL_HTML = "<html><body>Hypermark</body></html>";
  const PATCH = "diff --git a/src/parse.ts b/src/parse.ts\n@@ -1 +1 @@\n-a\n+b\n";

  const NOTE_TEXT = "Approved — consider extracting the parser helper in a follow-up.";
  const APPROVAL_FEEDBACK = `# Code Review Feedback\n\n## General\n\n${NOTE_TEXT}\n`;
  const NOTE = {
    id: "review-note-1",
    type: "comment",
    scope: "general",
    filePath: "",
    lineStart: 0,
    lineEnd: 0,
    side: "new",
    text: NOTE_TEXT,
    createdAt: 1735689600000,
  } as const;

  const tempDirs: string[] = [];
  const savedEnv: Record<string, string | undefined> = {};

  function saveEnv(key: string) {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  }

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  function useTempDataDir(): string {
    const dir = makeTempDir("hypermark-approval-notes-");
    saveEnv("HYPERMARK_DATA_DIR");
    process.env.HYPERMARK_DATA_DIR = dir;
    return dir;
  }

  function enableArchive() {
    saveEnv("HYPERMARK_FEEDBACK_HISTORY");
    process.env.HYPERMARK_FEEDBACK_HISTORY = "1";
  }


  function git(cwd: string, args: string[]): void {
    const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
    if (result.status !== 0) {
      throw new Error(result.stderr || `git ${args.join(" ")} failed`);
    }
  }

  function initRepo(): string {
    const repoDir = makeTempDir("hypermark-approval-repo-");
    git(repoDir, ["init", "-q"]);
    git(repoDir, ["branch", "-M", "main"]);
    git(repoDir, ["config", "user.email", "test@example.com"]);
    git(repoDir, ["config", "user.name", "Test"]);
    writeFileSync(join(repoDir, "README.md"), "# repo\n");
    git(repoDir, ["add", "README.md"]);
    git(repoDir, ["commit", "-q", "-m", "initial"]);
    return repoDir;
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
      delete savedEnv[key];
    }
    for (const dir of tempDirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {
        // Windows can hold a transient handle on a just-used temp git repo; the OS
        // reclaims it. Teardown noise must not fail a passing assertion.
      }
    }
  });

  for (const [runtime, startServer] of [
    ["Bun", startBunReviewServer],
  ] as const) {
    describe(`review approval-notes advert (${runtime})`, () => {
      test("absent option advertises false; passed option advertises true and survives /api/diff/switch", async () => {
        useTempDataDir();

        // Old-caller compatibility: no option = not capable.
        const legacy = await startServer({
          rawPatch: PATCH,
          gitRef: "HEAD",
          origin: "claude-code",
          htmlContent: MINIMAL_HTML,
        });
        try {
          const data = (await fetch(`${legacy.url}/api/diff`).then((r) => r.json())) as {
            approvalNotesSupported?: boolean;
          };
          expect(data.approvalNotesSupported).toBe(false);
        } finally {
          legacy.stop();
        }

        // Capable session: true on /api/diff AND on the switch payload, so the
        // advert cannot silently disappear after a diff switch.
        const repoDir = initRepo();
        const gitContext = await getVcsContext(repoDir, "git");
        const capable = await startServer({
          rawPatch: PATCH,
          gitRef: "Working tree",
          diffType: "uncommitted",
          gitContext,
          origin: "claude-code",
          approvalNotesSupported: true,
          htmlContent: MINIMAL_HTML,
        });
        try {
          const initial = (await fetch(`${capable.url}/api/diff`).then((r) => r.json())) as {
            approvalNotesSupported?: boolean;
          };
          expect(initial.approvalNotesSupported).toBe(true);

          const switched = (await fetch(`${capable.url}/api/diff/switch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ diffType: "uncommitted" }),
          }).then((r) => r.json())) as { approvalNotesSupported?: boolean; error?: string };
          expect(switched.error).toBeUndefined();
          expect(switched.approvalNotesSupported).toBe(true);
        } finally {
          capable.stop();
        }
      });
    });

    describe(`approve-with-notes delivery (${runtime})`, () => {
      test("approve-time feedback reaches waitForDecision unmodified and archives as approved-with-notes", async () => {
        const dataDir = useTempDataDir();
        enableArchive();
        const server = await startServer({
          rawPatch: PATCH,
          gitRef: "HEAD",
          origin: "claude-code",
          approvalNotesSupported: true,
          htmlContent: MINIMAL_HTML,
        });
        try {
          const decision = server.waitForDecision();
          const response = await fetch(`${server.url}/api/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ approved: true, feedback: APPROVAL_FEEDBACK, annotations: [NOTE] }),
          });
          expect(response.status).toBe(200);

          const result = await decision;
          expect(result.approved).toBe(true);
          // Byte-identical: this string is what the consumer prints after the
          // approved prompt — a rewrite here corrupts what the agent reads.
          expect(result.feedback).toBe(APPROVAL_FEEDBACK);
          expect(result.annotations).toEqual([NOTE]);

          const projects = readdirSync(join(dataDir, "feedback"));
          expect(projects.length).toBe(1);
          const records = parseFeedbackIndex(
            readFileSync(join(dataDir, "feedback", projects[0], "index.jsonl"), "utf-8"),
          );
          expect(records.length).toBe(1);
          expect(records[0].decision).toBe("approved-with-notes");
          expect(records[0].counts.annotations).toBe(1);
        } finally {
          server.stop();
        }
      });

      test("a bare approval (post-placeholder client shape) archives as lgtm with no sidecar", async () => {
        const dataDir = useTempDataDir();
        enableArchive();
        const server = await startServer({
          rawPatch: PATCH,
          gitRef: "HEAD",
          origin: "claude-code",
          approvalNotesSupported: true,
          htmlContent: MINIMAL_HTML,
        });
        try {
          const decision = server.waitForDecision();
          const response = await fetch(`${server.url}/api/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ approved: true, feedback: "", annotations: [] }),
          });
          expect(response.status).toBe(200);
          const result = await decision;
          expect(result.approved).toBe(true);
          expect(result.feedback).toBe("");

          const projects = readdirSync(join(dataDir, "feedback"));
          expect(projects.length).toBe(1);
          const records = parseFeedbackIndex(
            readFileSync(join(dataDir, "feedback", projects[0], "index.jsonl"), "utf-8"),
          );
          expect(records.length).toBe(1);
          // Reachable at last: the old client's LGTM placeholder made
          // hasContent always true, so every bare approval archived as
          // approved-with-notes plus a sidecar file.
          expect(records[0].decision).toBe("lgtm");
          expect(records[0].recordFile).toBeUndefined();
        } finally {
          server.stop();
        }
      });
    });
  }
});
