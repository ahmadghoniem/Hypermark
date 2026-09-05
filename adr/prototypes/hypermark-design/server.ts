import { join } from 'node:path';

const icons = new Set([
  'IconComment', 'IconPaperclip', 'IconFileCode', 'IconFolder', 'IconChevron',
  'IconDiffSplit', 'IconDiffUnified', 'IconTerminal', 'IconX', 'IconPlus',
  'IconArrowRight', 'IconImage', 'IconSearch', 'IconSun', 'IconMoon',
]);
const phosphorIcons = new Set(['chat-circle', 'pencil-simple', 'paperclip', 'x', 'check', 'plus', 'image', 'sun', 'moon']);
const scripts = new Set(['/prototype.mjs', '/comment-model.mjs']);

// Only synthetic design fixtures are exposed, never repository files.
Bun.serve({
  hostname: '0.0.0.0',
  port: 3000,
  fetch(request) {
    const path = new URL(request.url).pathname;
    const headers = { 'Cache-Control': 'no-store' };
    if (path === '/') return new Response(Bun.file(join(import.meta.dir, 'index.html')), { headers: { ...headers, 'Content-Type': 'text/html' } });
    if (path === '/sample.svg') return new Response(Bun.file(join(import.meta.dir, 'sample.svg')), { headers });
    if (scripts.has(path)) return new Response(Bun.file(join(import.meta.dir, path.slice(1))), { headers });
    const phosphor = /^\/phosphor\/([a-z-]+)\.svg$/.exec(path);
    if (phosphor && phosphorIcons.has(phosphor[1])) {
      return new Response(Bun.file(join(import.meta.dir, 'assets/phosphor', `${phosphor[1]}.svg`)), { headers });
    }
    const match = /^\/icons\/(\w+)\.svg$/.exec(path);
    if (match && icons.has(match[1])) {
      return new Response(Bun.file(join(import.meta.dir, 'assets/pierre-icons', `${match[1]}.svg`)), { headers });
    }
    if (path === '/favicon.ico') return new Response(null, { status: 204 });
    return new Response('Not found', { status: 404 });
  },
});

console.log('Hypermark design concepts: http://localhost:3000 (not the product)');
