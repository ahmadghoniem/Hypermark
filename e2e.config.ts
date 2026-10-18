import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { decisionExecutor } from '@e2e-dev/decision';
import { createTypeSafeAi } from '@ai-sdk/typesafe-ai';

// e2e loads no .env itself; NACE_API_KEY and LIQUID_API_KEY live there.
if (existsSync('.env')) process.loadEnvFile('.env');

// Decision models that speak TypeSafe's wire format pick taps, drags and key
// presses from the semantic tree; with no text model they never type.
// Liquid's d1-ultra is the default; Nace's Drex runs with `--agent drex`.
const nace = createTypeSafeAi({ apiKey: process.env.NACE_API_KEY, baseURL: 'https://console.nace.ai/v1' });
// d1-ultra also takes screenshots. TypeSafe sends images as multipart parts named in an
// `assets` map; Liquid wants JSON with data URIs in `images`, so the fetch
// rewrites the multipart body.
const liquidFetch: typeof fetch = async (url, init) => {
  if (!(init?.body instanceof FormData)) return fetch(url, init);
  const form = init.body;
  const request = JSON.parse(await (form.get('request') as Blob).text());
  const images: string[] = [];
  let state = typeof request.state === 'string' ? request.state : JSON.stringify(request.state);
  for (const [reference, asset] of Object.entries(request.assets as Record<string, { part: string }>)) {
    const blob = form.get(asset.part) as Blob;
    images.push(`data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`);
    state = state.replaceAll(reference, `[screenshot ${images.length}]`);
  }
  const { assets: _assets, ...rest } = request;
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  return fetch(url, { ...init, headers, body: JSON.stringify({ ...rest, state, images }) });
};
const liquid = createTypeSafeAi({ apiKey: process.env.LIQUID_API_KEY, baseURL: 'https://api.liquid.ai/decisions/v1', fetch: liquidFetch });

// Each run gets one data dir, so drafts and history never reach ~/.hypermark.
// The runner loads this config more than once per run and its workers inherit
// the environment, so the first load creates the dir and records it in
// HM_E2E_DATA_DIR; only that process removes it when the run ends.
let dataDir = process.env.HM_E2E_DATA_DIR;
if (!dataDir) {
  const created = mkdtempSync(join(tmpdir(), 'hm-e2e-'));
  dataDir = process.env.HM_E2E_DATA_DIR = created;
  process.once('exit', () => {
    try {
      rmSync(created, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // A file still locked by the app process; the OS temp cleanup takes it.
    }
  });
}

// The runner starts the command without a shell and passes only PATH, HOME and
// the temp variables; bun on Windows also needs these.
const passThrough = ['SystemRoot', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'];
const hostEnv = Object.fromEntries(
  passThrough.flatMap((name) => (process.env[name] ? [[name, process.env[name]!]] : [])),
);

export default {
  targets: [{
    engine: web(),
    app: {
      url: 'http://127.0.0.1:0',
      // A real `hypermark annotate` session on the built dist/annotate (`test:e2e` builds it first).
      command: {
        executable: 'bun',
        args: ['src/cli/index.ts', 'annotate', 'tests/e2e/fixtures/annotate.md'],
        env: {
          ...hostEnv,
          HYPERMARK_PORT: '{port}',
          HYPERMARK_SKIP_BROWSER_OPEN: '1',
          HYPERMARK_DATA_DIR: dataDir,
          // Side questions get a fixed answer, streamed, instead of a model call.
          HYPERMARK_SIDE_CHAT_STUB: '1',
        },
        log: '.e2e/logs/app.log',
      },
    },
  }],
  agents: {
    default: {
      executor: decisionExecutor({ model: liquid.decisionModel('d1-ultra') }),
    },
    // `vision: true` adds the screenshot to completion checks; on the comment
    // flow it made no difference and cost about 0.7s. Kept to compare on
    // flows whose result shows only on screen.
    vision: {
      executor: decisionExecutor({ model: liquid.decisionModel('d1-ultra'), vision: true }),
    },
    drex: {
      executor: decisionExecutor({ model: nace.decisionModel('drex-v2.0') }),
    },
  },
} satisfies E2EConfig;
