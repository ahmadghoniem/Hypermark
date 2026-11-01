/**
 * Vite plugin that mocks hypermark API endpoints for local development.
 *
 * The document itself is not served: with no `markdown` the app shows
 * DEMO_CONTENT from src/annotate/demoDocument.ts.
 */
import type { Plugin } from 'vite';

export function devMockApi(): Plugin {
  return {
    name: 'hypermark-dev-mock-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/config' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              JSON.parse(body);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid request' }));
            }
          });
          return;
        }

        if (req.url === '/api/side-chat' && req.method === 'POST') {
          req.resume();
          // Streams a canned answer word by word after a pause, like the real one.
          req.on('end', () => {
            const words = ('This is a canned reply from the dev mock API. The real side chat answers from the conversation, '
              + 'writes nothing to it, and nothing here is added to your feedback.').split(/(?<= )/);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            let i = 0;
            let timer = setTimeout(function next() {
              if (i === words.length) { res.end(); return; }
              res.write(words[i++]);
              timer = setTimeout(next, 60);
            }, 1500);
            res.on('close', () => clearTimeout(timer));
          });
          return;
        }

        // Uploads store nothing: the reply names a mock path, and /api/image
        // draws a placeholder for any path. A file named with "fail" is refused.
        if (req.url === '/api/upload' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString('latin1'); });
          req.on('end', () => {
            const name = /filename="([^"]*)"/.exec(body)?.[1] || 'image.png';
            res.setHeader('Content-Type', 'application/json');
            if (name.includes('fail')) {
              res.statusCode = 413;
              res.end(JSON.stringify({ error: 'File too large' }));
              return;
            }
            res.end(JSON.stringify({ path: `/mock/${name}`, originalName: name }));
          });
          return;
        }

        if (req.url?.startsWith('/api/image?')) {
          const name = new URL(req.url, 'http://localhost').searchParams.get('path')?.split('/').pop() ?? '';
          const label = name.replace(/[<>&"]/g, '');
          res.setHeader('Content-Type', 'image/svg+xml');
          res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">`
            + `<rect width="640" height="400" fill="#3b4252"/><circle cx="200" cy="150" r="48" fill="#88c0d0"/>`
            + `<path d="M0 400 L230 210 L380 330 L480 250 L640 400 Z" fill="#5e81ac"/>`
            + `<text x="320" y="380" fill="#eceff4" font-family="sans-serif" font-size="22" text-anchor="middle">${label}</text></svg>`);
          return;
        }

        if (req.url === '/api/document') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            mode: 'annotate',
          }));
          return;
        }


        next();
      });
    },
  };
}
