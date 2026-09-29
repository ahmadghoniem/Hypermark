/**
 * Image upload: POST /api/upload with the file as multipart form-data,
 * response `{ path, originalName }`.
 */

export interface UploadResult {
  /** Stored reference the UI round-trips and feeds to `getImageSrc` (the server file path). */
  path: string;
  /** Original file name, when the backend echoes it. */
  originalName?: string;
}

/**
 * Upload one image file and resolve to its stored reference.
 *
 * A malformed or error response is rejected rather than reported as a stored
 * image. A non-OK status, an unparseable body, or a missing/empty `path` all
 * throw, so the composer keeps the file and the typed text and offers a retry
 * instead of recording an unusable reference.
 */
export async function upload(file: File): Promise<UploadResult> {
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
}

/** Validate an upload result before the UI treats it as a stored image. */
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
