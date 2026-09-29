import { afterEach, describe, expect, test } from 'bun:test';
import { fetchHtmlDocumentSnapshot } from './sourceDocumentClient';

const originalFetch = globalThis.fetch;

function mockFetch(response: Response | Error) {
  const stub = async () => {
    if (response instanceof Error) throw response;
    return response;
  };
  stub.preconnect = () => {};
  globalThis.fetch = stub as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('source document client', () => {
  test('fetches a rendered html snapshot', async () => {
    mockFetch(Response.json({
      rawHtml: '<main>after</main>',
      filepath: '/repo/docs/a.html',
      renderAs: 'html',
    }));

    expect(await fetchHtmlDocumentSnapshot('/repo/docs/a.html')).toEqual({
      status: 'ok',
      snapshot: {
        rawHtml: '<main>after</main>',
        filepath: '/repo/docs/a.html',
      },
    });
  });

  test('keeps the current html available when refresh cannot load a valid snapshot', async () => {
    mockFetch(new Response('missing', { status: 404 }));
    expect(await fetchHtmlDocumentSnapshot('/repo/docs/missing.html')).toEqual({ status: 'missing' });

    mockFetch(Response.json({ markdown: '# Not HTML', renderAs: 'markdown' }));
    expect(await fetchHtmlDocumentSnapshot('/repo/docs/a.html')).toEqual({ status: 'unavailable' });

    mockFetch(new Error('network'));
    expect(await fetchHtmlDocumentSnapshot('/repo/docs/a.html')).toEqual({ status: 'unavailable' });
  });
});

