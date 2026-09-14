/**
 * /api/skills — end-to-end route wiring, both runtimes.
 *
 * Same class of guard as annotate.test.ts (#844): a handler that exists but is
 * not wired into a server's route table falls through to the SPA HTML
 * catch-all (plan/annotate) and the composer silently loses skill references.
 * This boots the real Bun plan + annotate servers — the surfaces
 * that serve the comment composer — against isolated skill roots and asserts
 * the route answers with the real discovered catalog as JSON.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Distinct module key so unrelated mock.module() tests cannot replace the
// real server (same pattern as api-404-guard.test.ts).
import { startAnnotateServer as startBunAnnotateServer } from "./annotate.ts?skills-endpoint";
import { startHypermarkServer as startBunPlanServer } from "./index";

const SPA_HTML = "<!doctype html><html><body>SPA fallback</body></html>";

interface RunningServer {
  readonly url: string;
  stop(): void;
}

let base = "";
let home = "";
let archivePath = "";
const ENV_KEYS = [
  "HOME",
  "CLAUDE_CONFIG_DIR",
  "XDG_CONFIG_HOME",
  "HYPERMARK_DATA_DIR",
  "HYPERMARK_PORT",
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "hypermark-skills-endpoint-"));
  home = join(base, "home");
  archivePath = join(base, "plans");
  mkdirSync(home, { recursive: true });
  mkdirSync(archivePath, { recursive: true });

  // One model-invocable and one human-only skill in the isolated Claude root.
  const root = join(home, ".claude", "skills");
  for (const [name, fm] of [
    ["endpoint-skill", "description: A test skill."],
    ["endpoint-human-only", "disable-model-invocation: true"],
  ] as const) {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\n${fm}\n---\n# ${name}\n`);
  }
  // A real file outside every skill root, for the traversal probe below.
  writeFileSync(join(home, "outside.md"), "must never be served");
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.HOME = home;
  process.env.CLAUDE_CONFIG_DIR = join(home, ".claude");
  process.env.XDG_CONFIG_HOME = join(home, ".config");
  process.env.HYPERMARK_DATA_DIR = join(base, "data");
  delete process.env.HYPERMARK_PORT;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const serverCases = [
  {
    name: "Bun plan",
    start: () =>
      startBunPlanServer({
        plan: "# Test Plan",
        origin: "claude-code",
        htmlContent: SPA_HTML,
        mode: "archive",
        customPlanPath: archivePath,
      }) as Promise<RunningServer>,
  },
  {
    name: "Bun annotate",
    start: () =>
      startBunAnnotateServer({
        markdown: "# Test Document",
        filePath: join(tmpdir(), "test.md"),
        origin: "claude-code",
        htmlContent: SPA_HTML,
      }) as Promise<RunningServer>,
  },
] as const;

describe("GET /api/skills route wiring", () => {
  for (const serverCase of serverCases) {
    test(`${serverCase.name}: served as JSON with the discovered catalog, not the SPA catch-all`, async () => {
      const server = await serverCase.start();
      try {
        const response = await fetch(`${server.url}/api/skills`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("application/json");

        const body = (await response.json()) as {
          skills: Array<{ name: string; root: string; humanOnly: boolean }>;
        };
        expect(Array.isArray(body.skills)).toBe(true);
        const byName = new Map(body.skills.map((s) => [s.name, s]));
        expect(byName.get("endpoint-skill")).toMatchObject({
          root: "claude",
          humanOnly: false,
          description: "A test skill.",
          dir: join(home, ".claude", "skills", "endpoint-skill"),
        });
        expect(byName.get("endpoint-human-only")).toMatchObject({
          root: "claude",
          humanOnly: true,
          dir: join(home, ".claude", "skills", "endpoint-human-only"),
        });
      } finally {
        server.stop();
      }
    });
  }
});

describe("GET /api/skills/content route wiring", () => {
  for (const serverCase of serverCases) {
    test(`${serverCase.name}: serves the frontmatter-stripped body, 404s the unknown, rejects traversal`, async () => {
      const server = await serverCase.start();
      try {
        const dir = join(home, ".claude", "skills", "endpoint-human-only");
        const ok = await fetch(
          `${server.url}/api/skills/content?name=endpoint-human-only`,
        );
        expect(ok.status).toBe(200);
        expect(ok.headers.get("content-type")).toContain("application/json");
        const body = (await ok.json()) as { skill: Record<string, unknown> };
        expect(body.skill).toMatchObject({
          name: "endpoint-human-only",
          dir,
          path: join(dir, "SKILL.md"),
          content: "# endpoint-human-only",
          truncated: false,
          humanOnly: true,
        });

        const missing = await fetch(`${server.url}/api/skills/content?name=nope`);
        expect(missing.status).toBe(404);

        // Traversal: a name is only ever MATCHED against discovered skills,
        // never used as a path — outside.md must be unreachable.
        for (const name of ["../../outside.md", "..%2F..%2Foutside.md", "/etc/hosts"]) {
          const res = await fetch(
            `${server.url}/api/skills/content?name=${encodeURIComponent(name)}`,
          );
          expect(res.status).toBe(404);
          expect(await res.text()).not.toContain("must never be served");
        }
      } finally {
        server.stop();
      }
    });
  }
});
