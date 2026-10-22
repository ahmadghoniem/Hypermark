/**
 * Durable feedback archive — server wiring (Bun runtime).
 *
 * Regressions guarded here:
 *  - "feedback lost": /api/feedback used to delete the draft, settle the
 *    decision promise, and persist nothing, so a submission made after the
 *    invoking agent timed out existed nowhere.
 *  - "opt-out ignored": HYPERMARK_FEEDBACK_HISTORY / feedbackHistory must
 *    stop every write.
 *  - "stateless annotate broken": HYPERMARK_ANNOTATE_HISTORY=0 must still
 *    mean "annotate sessions write nothing to the data dir".
 *
 * Every test sandboxes the archive under a temp HYPERMARK_DATA_DIR set
 * inside the test body.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startAnnotateServer } from "./annotate";
import {
  appendFeedbackRecord,
  normalizeFeedbackProject,
  parseFeedbackIndex,
  type FeedbackRecord,
} from "@/shared/feedback-archive";
import { getHypermarkDataDir } from "@/shared/data-dir";

const MINIMAL_HTML = "<html><body>Hypermark</body></html>";

// Annotate version history goes through storage.ts, whose data dir is fixed at
// import time, so these sessions snapshot into the REAL data dir no matter what
// HYPERMARK_DATA_DIR says here. Distinctive, test-owned project names keep
// that out of any real project's bucket and let afterAll remove it whole.
const FILE_ANNOTATE_PROJECT = "_feedback_archive_test_file";
const STATELESS_ANNOTATE_PROJECT = "_feedback_archive_test_stateless";
const URL_ANNOTATE_PROJECT = "_feedback_archive_test_url";

const saved: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "HYPERMARK_DATA_DIR",
  "HYPERMARK_FEEDBACK_HISTORY",
  "HYPERMARK_ANNOTATE_HISTORY",
  "HYPERMARK_PORT",
] as const;

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Point the archive (and drafts) at a fresh temp data dir for this test. */
function useTempDataDir(): string {
  const dir = makeTempDir("hypermark-feedback-wiring-");
  process.env.HYPERMARK_DATA_DIR = dir;
  return dir;
}

function feedbackDir(dataDir: string): string {
  return join(dataDir, "feedback");
}

/** The archive holds exactly one project dir per test; read its index. */
function readOnlyIndex(dataDir: string): FeedbackRecord[] {
  const projects = readdirSync(feedbackDir(dataDir));
  expect(projects.length).toBe(1);
  const indexPath = join(feedbackDir(dataDir), projects[0], "index.jsonl");
  return parseFeedbackIndex(readFileSync(indexPath, "utf-8"));
}

function sidecarBody(dataDir: string, record: FeedbackRecord): string {
  const projects = readdirSync(feedbackDir(dataDir));
  return readFileSync(join(feedbackDir(dataDir), projects[0], record.recordFile!), "utf-8");
}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  delete process.env.HYPERMARK_PORT;
  // A real ~/.hypermark/config.json must never decide these tests.
  process.env.HYPERMARK_FEEDBACK_HISTORY = "1";
  process.env.HYPERMARK_ANNOTATE_HISTORY = "1";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key]!;
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

afterAll(() => {
  // Remove the annotate history these tests deposited in the real data dir.
  // Runs with the env already restored, so this resolves the same directory
  // storage.ts wrote to.
  const historyDir = join(getHypermarkDataDir(), "history");
  for (const project of [FILE_ANNOTATE_PROJECT, STATELESS_ANNOTATE_PROJECT, URL_ANNOTATE_PROJECT]) {
    rmSync(join(historyDir, project), { recursive: true, force: true });
  }
});

describe("annotate submissions are archived", () => {
  function startUrlSession() {
    return startAnnotateServer({
      markdown: "# Fetched page\n\nBody\n",
      filePath: "https://example.com/some/page",
      htmlContent: MINIMAL_HTML,
      project: URL_ANNOTATE_PROJECT,
    });
  }

  test("HYPERMARK_FEEDBACK_HISTORY=0 writes nothing", async () => {
    const dataDir = useTempDataDir();
    process.env.HYPERMARK_FEEDBACK_HISTORY = "0";
    const server = await startUrlSession();
    try {
      const response = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "secret", annotations: [{ id: "a1" }] }),
      });
      expect(response.status).toBe(200);
      expect(existsSync(feedbackDir(dataDir))).toBe(false);
    } finally {
      server.stop();
    }
  });

  test("{ feedbackHistory: false } in config.json writes nothing", async () => {
    const dataDir = useTempDataDir();
    delete process.env.HYPERMARK_FEEDBACK_HISTORY; // config must decide
    writeFileSync(join(dataDir, "config.json"), JSON.stringify({ feedbackHistory: false }), "utf-8");
    const server = await startUrlSession();
    try {
      const response = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "secret", annotations: [] }),
      });
      expect(response.status).toBe(200);
      expect(existsSync(feedbackDir(dataDir))).toBe(false);
    } finally {
      server.stop();
    }
  });

  test("a URL session — which writes no history — still records the submission", async () => {
    // Behavior change by design: URL / annotate-last / folder
    // submissions leave a durable record for the first time.
    const dataDir = useTempDataDir();
    const server = await startAnnotateServer({
      markdown: "# Fetched page\n\nBody\n",
      filePath: "https://example.com/some/page",
      htmlContent: MINIMAL_HTML,
      project: URL_ANNOTATE_PROJECT,
    });
    try {
      const response = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "The fetched page says Z.", annotations: [] }),
      });
      expect(response.status).toBe(200);
      const records = readOnlyIndex(dataDir);
      expect(records[0].surface).toBe("annotate-url");
      expect(records[0].target?.url).toBe("https://example.com/some/page");
      // The archive stores the submission, never a copy of the fetched page.
      expect(existsSync(join(dataDir, "history"))).toBe(false);
    } finally {
      server.stop();
    }
  });

  test("HYPERMARK_ANNOTATE_HISTORY=0 keeps annotate sessions fully stateless", async () => {
    // The documented stateless-annotate promise: the opt-out means "no
    // annotate writes to the data dir", and submitted feedback quotes the
    // annotated content, so the archive must honor it too.
    const dataDir = useTempDataDir();
    process.env.HYPERMARK_ANNOTATE_HISTORY = "0";
    const dir = makeTempDir("hypermark-feedback-annotate-");
    const docPath = join(dir, "doc.md");
    writeFileSync(docPath, "# Doc\n\nBody\n", "utf-8");
    const server = await startAnnotateServer({
      markdown: "# Doc\n\nBody\n",
      filePath: docPath,
      htmlContent: MINIMAL_HTML,
      project: STATELESS_ANNOTATE_PROJECT,
    });
    try {
      const response = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "Secret excerpt", annotations: [{ id: "a1" }] }),
      });
      expect(response.status).toBe(200);
      expect(existsSync(feedbackDir(dataDir))).toBe(false);
      expect(existsSync(join(dataDir, "history"))).toBe(false);
    } finally {
      server.stop();
    }
  });

  test("a single local file session records the submission and its file path", async () => {
    const dataDir = useTempDataDir();
    const dir = makeTempDir("hypermark-feedback-annotate-file-");
    const docPath = join(dir, "notes.md");
    writeFileSync(docPath, "# Notes\n\nBody\n", "utf-8");
    const server = await startAnnotateServer({
      markdown: "# Notes\n\nBody\n",
      filePath: docPath,
      htmlContent: MINIMAL_HTML,
      project: FILE_ANNOTATE_PROJECT,
    });
    try {
      const response = await fetch(`${server.url}/api/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "LGTM, but rename the helper.", annotations: [] }),
      });
      expect(response.status).toBe(200);
      const records = readOnlyIndex(dataDir);
      expect(records[0].surface).toBe("annotate");
      expect(records[0].decision).toBe("approved-with-notes");
      expect(records[0].target?.filePath).toBe(resolve(docPath));
      expect(sidecarBody(dataDir, records[0])).toContain("rename the helper");
    } finally {
      server.stop();
    }
  });
});

/**
 * Feedback archive module — record shape, append durability, failure policy.
 *
 * Each test names the regression it guards. The archive is the only durable
 * copy of a submitted review, so the failures worth pinning are: an append
 * that damages earlier records, a record that silently grows to the size of
 * the diff it describes, a sidecar that overwrites an earlier one, and a
 * storage failure that escapes into a request handler.
 *
 * All writes are sandboxed under a temp HYPERMARK_DATA_DIR set INSIDE the
 * tests (the module resolves the data dir per call precisely so this works
 * under Bun's one-process rule), and the env var is restored in afterEach.
 */
describe("feedback archive module", () => {
  const PROJECT = "archive-test";

  let savedDataDir: string | undefined;
  const tempDirs: string[] = [];

  function useTempDataDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "hypermark-feedback-archive-"));
    tempDirs.push(dir);
    process.env.HYPERMARK_DATA_DIR = dir;
    return dir;
  }

  function projectDir(dataDir: string, project = PROJECT): string {
    return join(dataDir, "feedback", project);
  }

  function readIndex(dataDir: string, project = PROJECT): FeedbackRecord[] {
    return parseFeedbackIndex(readFileSync(join(projectDir(dataDir, project), "index.jsonl"), "utf-8"));
  }

  beforeEach(() => {
    savedDataDir = process.env.HYPERMARK_DATA_DIR;
  });

  afterEach(() => {
    if (savedDataDir === undefined) delete process.env.HYPERMARK_DATA_DIR;
    else process.env.HYPERMARK_DATA_DIR = savedDataDir;
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  describe("feedback archive: record shape", () => {
    test("a content record lands as one index line plus one readable sidecar", () => {
      const dataDir = useTempDataDir();
      const indexPath = appendFeedbackRecord({
        project: PROJECT,
        origin: "claude-code",
        surface: "annotate",
        decision: "feedback",
        target: { filePath: "/work/plan.md" },
        feedback: "Please handle the null case in parse().",
        annotations: [
          { id: "a1", type: "COMMENT", text: "null case", originalText: "parse()", blockId: "b3" },
        ],
      });
      expect(indexPath).not.toBeNull();

      const records = readIndex(dataDir);
      expect(records.length).toBe(1);
      const record = records[0];
      expect(record.v).toBe(1);
      expect(record.client).toBe("hypermark");
      expect(record.surface).toBe("annotate");
      expect(record.decision).toBe("feedback");
      expect(record.feedback).toContain("null case in parse()");
      expect(record.counts).toEqual({ annotations: 1, images: 0 });
      expect(record.annotations?.[0]).toMatchObject({ originalText: "parse()", blockId: "b3" });

      // The sidecar the index names must exist and carry the same feedback.
      expect(record.recordFile).toBeTruthy();
      const sidecar = readFileSync(join(projectDir(dataDir), record.recordFile!), "utf-8");
      expect(sidecar).toContain("Please handle the null case in parse().");
      expect(sidecar).toContain("- File: /work/plan.md");
    });

    test("a bare decision is a decision-only line with no sidecar", () => {
      // Approval and dismissal rates are the behavior data the archive exists
      // for; writing an empty markdown file for each would be noise.
      const dataDir = useTempDataDir();
      appendFeedbackRecord({ project: PROJECT, surface: "annotate", decision: "dismissed" });
      const record = readIndex(dataDir)[0];
      expect(record.recordFile).toBeUndefined();
      expect(record.counts.annotations).toBe(0);
      expect(existsSync(join(projectDir(dataDir), "records"))).toBe(false);
    });
  });

  describe("feedback archive: append durability", () => {
    test("successive appends never rewrite earlier lines", () => {
      // Index corruption regression: the archive is a timeline, so a second
      // decision on the same session must extend it, never replace it (the
      // legacy plans/ snapshot overwrites by slug; the archive must not).
      const dataDir = useTempDataDir();
      for (const decision of ["denied", "feedback", "approved"] as const) {
        appendFeedbackRecord({ project: PROJECT, surface: "annotate", decision, feedback: `note ${decision}` });
      }
      const records = readIndex(dataDir);
      expect(records.map((r) => r.decision)).toEqual(["denied", "feedback", "approved"]);
      expect(readdirSync(join(projectDir(dataDir), "records")).length).toBe(3);
    });

    test("feedback containing newlines still serializes to exactly one line", () => {
      // A record that spanned lines would make every later append unparsable
      // for a line-oriented reader.
      const dataDir = useTempDataDir();
      appendFeedbackRecord({
        project: PROJECT,
        surface: "annotate",
        decision: "feedback",
        feedback: "## Heading\n\n- one\n- two\n\n```js\nconst a = 1;\n```\n",
      });
      appendFeedbackRecord({ project: PROJECT, surface: "annotate", decision: "approved" });
      const raw = readFileSync(join(projectDir(dataDir), "index.jsonl"), "utf-8");
      expect(raw.trimEnd().split("\n").length).toBe(2);
      expect(readIndex(dataDir)[0].feedback).toContain("const a = 1;");
    });

    test("a torn last line is skipped, and the records before it still read", () => {
      const dataDir = useTempDataDir();
      appendFeedbackRecord({ project: PROJECT, surface: "annotate", decision: "approved" });
      const indexPath = join(projectDir(dataDir), "index.jsonl");
      writeFileSync(indexPath, readFileSync(indexPath, "utf-8") + '{"v":1,"ts":"2026', "utf-8");
      const records = parseFeedbackIndex(readFileSync(indexPath, "utf-8"));
      expect(records.length).toBe(1);
      expect(records[0].decision).toBe("approved");
    });

    test("sidecars written in the same millisecond never overwrite each other", () => {
      // The stamp is per-millisecond, so two fast submissions collide; losing
      // one would lose a submission.
      const dataDir = useTempDataDir();
      const now = new Date("2026-08-31T14:22:07.511Z");
      appendFeedbackRecord({ project: PROJECT, surface: "annotate", decision: "feedback", feedback: "first", now });
      appendFeedbackRecord({ project: PROJECT, surface: "annotate", decision: "feedback", feedback: "second", now });
      const recordsDir = join(projectDir(dataDir), "records");
      const files = readdirSync(recordsDir).sort();
      expect(files.length).toBe(2);
      const bodies = files.map((f) => readFileSync(join(recordsDir, f), "utf-8"));
      expect(bodies.some((b) => b.includes("first"))).toBe(true);
      expect(bodies.some((b) => b.includes("second"))).toBe(true);
      // Each index line names its own sidecar.
      const named = readIndex(dataDir).map((r) => r.recordFile);
      expect(new Set(named).size).toBe(2);
    });

    test("an unwritable data dir reports failure instead of throwing", () => {
      // The module is called from inside request handlers; a throw would turn a
      // reviewer's submit into a 500.
      const dir = mkdtempSync(join(tmpdir(), "hypermark-feedback-archive-fail-"));
      tempDirs.push(dir);
      const blocker = join(dir, "blocker");
      writeFileSync(blocker, "not a directory", "utf-8");
      process.env.HYPERMARK_DATA_DIR = join(blocker, "nested");
      expect(() =>
        expect(appendFeedbackRecord({ project: PROJECT, surface: "annotate", decision: "feedback", feedback: "x" })).toBeNull(),
      ).not.toThrow();
    });
  });

  describe("feedback archive: shared index", () => {
    test("another client's lines survive our reader, unknown fields and all", () => {
      // The index is shared: hypermark-tui appends to the same file. A reader
      // that validated `client` against an enum, rejected unknown fields, or
      // parsed sidecar filenames would silently drop every line another tool
      // wrote. Fields are added and never repurposed, so tolerance is the rule.
      const dataDir = useTempDataDir();
      appendFeedbackRecord({ project: PROJECT, surface: "annotate", decision: "approved" });
      const indexPath = join(projectDir(dataDir), "index.jsonl");
      const foreign = {
        v: 1,
        ts: "2026-09-01T09:00:00.000Z",
        client: "hypermark-tui",
        clientVersion: "0.3.1",
        project: PROJECT,
        surface: "annotate-last",
        decision: "feedback",
        target: { agent: { host: "claude-code", session: "s-1", transcript: "/t/1.jsonl" } },
        feedback: "from the terminal client",
        counts: { annotations: 0, images: 0 },
        recordFile: "records/2026-09-01T09-00-00-000Z-annotate-last-feedback-hypermark-tui.md",
        somethingWeHaveNeverHeardOf: { nested: true },
      };
      writeFileSync(indexPath, readFileSync(indexPath, "utf-8") + JSON.stringify(foreign) + "\n", "utf-8");

      const records = readIndex(dataDir);
      expect(records.length).toBe(2);
      expect(records.map((r) => r.client)).toEqual(["hypermark", "hypermark-tui"]);
      // The suffixed sidecar name round-trips untouched: recordFile is a handle,
      // never something to parse.
      expect(records[1].recordFile).toEndWith("-hypermark-tui.md");
      expect(records[1].target?.agent?.host).toBe("claude-code");
      expect(records[1].clientVersion).toBe("0.3.1");
    });
  });

  describe("feedback archive: project bucketing", () => {
    test("the project segment matches the history/ convention and cannot escape the archive", () => {
      expect(normalizeFeedbackProject("hypermark")).toBe("hypermark");
      expect(normalizeFeedbackProject("_unknown")).toBe("_unknown");
      expect(normalizeFeedbackProject(null)).toBe("_unknown");
      expect(normalizeFeedbackProject("../../etc")).toBe("etc");
    });
  });
});
