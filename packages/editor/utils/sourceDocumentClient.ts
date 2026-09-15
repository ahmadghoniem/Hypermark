export interface HtmlVersionDiffFields {
  /** The previous-version page rendered with inline ins/del highlights. */
  diffHtml?: string;
  previousPlan?: string | null;
  versionInfo?: { version: number; totalVersions: number; project: string };
}

interface SourceDocumentResponse extends HtmlVersionDiffFields {
  markdown?: string;
  rawHtml?: string;
  filepath?: string;
  renderAs?: 'markdown' | 'html';
}

type SourceDocumentFetchResult =
  | { status: 'ok'; data: SourceDocumentResponse }
  | { status: 'missing' }
  | { status: 'unavailable' };

/**
 * A rendered-HTML document read from /api/doc. The version-diff fields are
 * present only when the server served the session's ROOT document (it
 * recomputes them against the bytes just read); linked docs carry none.
 */
interface HtmlDocumentSnapshot extends HtmlVersionDiffFields {
  rawHtml: string;
  filepath: string;
}

export type HtmlDocumentSnapshotResult =
  | { status: 'ok'; snapshot: HtmlDocumentSnapshot }
  | { status: 'missing' }
  | { status: 'unavailable' };

async function fetchSourceDocument(path: string): Promise<SourceDocumentFetchResult> {
  try {
    const res = await fetch(`/api/doc?path=${encodeURIComponent(path)}`);
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'unavailable' };
    return { status: 'ok', data: await res.json() as SourceDocumentResponse };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function fetchHtmlDocumentSnapshot(path: string): Promise<HtmlDocumentSnapshotResult> {
  const result = await fetchSourceDocument(path);
  if (result.status !== 'ok') return { status: result.status };

  const { filepath, rawHtml, renderAs, diffHtml, previousPlan, versionInfo } = result.data;
  if (renderAs !== 'html' || typeof rawHtml !== 'string' || typeof filepath !== 'string') {
    return { status: 'unavailable' };
  }
  return {
    status: 'ok',
    snapshot: {
      rawHtml,
      filepath,
      ...(typeof diffHtml === 'string' ? { diffHtml } : {}),
      ...(previousPlan !== undefined ? { previousPlan } : {}),
      ...(versionInfo ? { versionInfo } : {}),
    },
  };
}

