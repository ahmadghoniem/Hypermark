/**
 * Host-overridable image upload transport.
 *
 * Default = today's literal Plannotator behavior (POST /api/upload with the
 * file as multipart form-data, response `{ path, originalName }`). A host
 * (e.g. Workspaces) calls `setUploadTransport` once at startup to send the
 * bytes to its own asset backend instead. Mirrors the swappable transports in
 * ./storage.ts and ../hooks/useAnnotationDraft.ts.
 */

export interface UploadResult {
  /**
   * Stored reference the UI round-trips and feeds to the image-src resolver.
   * Plannotator returns the server file path. A host may return its own opaque
   * ref or a fully-resolved URL (the default image-src resolver passes http(s)
   * URLs through unchanged, so a returned URL renders directly).
   */
  path: string;
  /** Original file name, when the backend echoes it. */
  originalName?: string;
}

export interface UploadTransport {
  /** Upload one image file and resolve to its stored reference. */
  upload(file: File): Promise<UploadResult>;
}

/**
 * Default transport — Plannotator's `/api/upload` multipart POST.
 *
 * Spec 05 §3.2.5: a malformed or error response must be rejected rather than
 * reported as a stored image. A non-OK status, an unparseable body, or a
 * missing/empty `path` all throw, so the composer keeps the file and the typed
 * text and offers a retry instead of recording an unusable reference.
 */
const defaultUploadTransport: UploadTransport = {
  async upload(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    // `ok` is absent only on hand-rolled stubs; a real Response always has it.
    if (res.ok === false) {
      throw new Error(`Upload failed with status ${res.status}`);
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new Error('Upload response was not valid JSON');
    }
    return assertUploadResult(data);
  },
};

/**
 * Validate any transport's result before the UI treats it as a stored image.
 * Exported so host transports and the composer share one definition of "usable".
 */
export function assertUploadResult(data: unknown): UploadResult {
  const record = (data ?? {}) as { path?: unknown; originalName?: unknown };
  const path = typeof record.path === 'string' ? record.path.trim() : '';
  if (!path) {
    throw new Error('Upload response did not include a stored image path');
  }
  return {
    path,
    originalName: typeof record.originalName === 'string' ? record.originalName : undefined,
  };
}

// Module-level transport, stable identity. Defaults to Plannotator's behavior so
// callers are unchanged. A host overrides it once at startup.
let uploadTransport: UploadTransport = defaultUploadTransport;

/** Override how image attachments are uploaded. Call once at app startup. */
export function setUploadTransport(t: UploadTransport): void {
  uploadTransport = t;
}

/** Reset to the default (Plannotator `/api/upload`) transport. Mainly for tests. */
export function resetUploadTransport(): void {
  uploadTransport = defaultUploadTransport;
}

/** Read the active upload transport at call time (so a late override is honored). */
export function getUploadTransport(): UploadTransport {
  return uploadTransport;
}
