/**
 * generatedFiles sidecar on /api/diff (#1317).
 *
 * Guards the server's routing, not the attribute rules (generated-files.test.ts
 * owns those):
 *  1. A plain local git session resolves `linguist-generated` through git, and
 *     the diff itself still ships unfiltered.
 *  2. Sessions without local git access (piped patches)
 *     emit the sidecar from the built-in name defaults alone,
 *     and omit it when no served path matches.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startReviewServer as startBunReviewServer } from './review';
import { getVcsContext } from './vcs';

const originalDataDir = process.env.HYPERMARK_DATA_DIR;
const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  }
}

function initRepo(): string {
  const repoDir = makeTempDir('hypermark-generated-endpoint-');
  git(repoDir, ['init', '-q']);
  git(repoDir, ['branch', '-M', 'main']);
  git(repoDir, ['config', 'user.email', 'test@example.com']);
  git(repoDir, ['config', 'user.name', 'Test']);
  writeFileSync(join(repoDir, 'README.md'), '# repo\n');
  git(repoDir, ['add', 'README.md']);
  git(repoDir, ['commit', '-q', '-m', 'initial']);
  return repoDir;
}

function fileChunk(path: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1 +1 @@',
    '-old',
    '+new',
  ].join('\n');
}

const RAW_PATCH = [
  fileChunk('gen/schema.sql'),
  fileChunk('gen/keep.ts'),
  fileChunk('docs/api.md'),
  fileChunk('src/app.ts'),
].join('\n');

afterEach(() => {
  if (originalDataDir === undefined) delete process.env.HYPERMARK_DATA_DIR;
  else process.env.HYPERMARK_DATA_DIR = originalDataDir;
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } catch {
      // Windows can hold a transient handle on a just-used temp git repo; the OS
      // reclaims it. Teardown noise must not fail a passing assertion.
    }
  }
});

describe('generatedFiles sidecar (#1317)', () => {
  test('resolves linguist-generated via git, honoring negated rules', async () => {
    process.env.HYPERMARK_DATA_DIR = makeTempDir('hypermark-generated-data-');
    const repoDir = initRepo();
    writeFileSync(
      join(repoDir, '.gitattributes'),
      [
        'gen/** linguist-generated',
        // Negated rule stacked after the glob — must win, exactly as git
        // resolves it (a naive first-match parser would mark it generated).
        'gen/keep.ts -linguist-generated',
        'docs/api.md linguist-generated=true',
      ].join('\n') + '\n',
    );
    mkdirSync(join(repoDir, 'gen'), { recursive: true });
    const gitContext = await getVcsContext(repoDir, 'git');

    const server = await startBunReviewServer({
      rawPatch: RAW_PATCH,
      gitRef: 'Working tree',
      diffType: 'uncommitted',
      gitContext,
      origin: 'claude-code',
      htmlContent: '<!doctype html><html><body>review</body></html>',
    });
    try {
      const data = await fetch(`${server.url}/api/diff`).then((r) => r.json()) as {
        rawPatch: string;
        generatedFiles?: string[];
      };
      expect(data.generatedFiles).toEqual(['gen/schema.sql', 'docs/api.md']);
      // Presentation-layer contract: the diff itself is never filtered —
      // every generated file's content still ships in full.
      expect(data.rawPatch).toBe(RAW_PATCH);
    } finally {
      server.stop();
    }
  });

  test('without local git access emits the sidecar from name defaults alone', async () => {
    process.env.HYPERMARK_DATA_DIR = makeTempDir('hypermark-generated-data-');
    const server = await startBunReviewServer({
      rawPatch: [fileChunk('bun.lock'), fileChunk('src/app.ts')].join('\n'),
      gitRef: 'Piped diff',
      diffType: 'uncommitted',
      origin: 'claude-code',
      htmlContent: '<!doctype html><html><body>review</body></html>',
    });
    try {
      const data = await fetch(`${server.url}/api/diff`).then((r) => r.json()) as {
        generatedFiles?: string[];
      };
      expect(data.generatedFiles).toEqual(['bun.lock']);
    } finally {
      server.stop();
    }
  });

  test('omits the sidecar without git when no path matches a default', async () => {
    process.env.HYPERMARK_DATA_DIR = makeTempDir('hypermark-generated-data-');
    const server = await startBunReviewServer({
      rawPatch: RAW_PATCH,
      gitRef: 'Piped diff',
      diffType: 'uncommitted',
      origin: 'claude-code',
      htmlContent: '<!doctype html><html><body>review</body></html>',
    });
    try {
      const data = await fetch(`${server.url}/api/diff`).then((r) => r.json()) as {
        generatedFiles?: string[];
      };
      expect(data.generatedFiles).toBeUndefined();
    } finally {
      server.stop();
    }
  });
});
