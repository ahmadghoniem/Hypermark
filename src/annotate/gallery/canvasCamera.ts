/**
 * Camera math and storage for the component canvas. A point in the world
 * shows on screen at `world * zoom + (x, y)`. No DOM access here, so the
 * shell can stay thin and this file can be tested on its own.
 */

export interface Camera { x: number; y: number; zoom: number }
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Size { width: number; height: number }

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
/** How far the world origin may sit from the screen, so a bad value can't lose the view for good. */
const MAX_OFFSET = 200_000;
export const DEFAULT_CAMERA: Camera = { x: 64, y: 64, zoom: 1 };

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, finiteOr(zoom, DEFAULT_CAMERA.zoom)));
}

/** Replaces non-finite values with the defaults and keeps every value in range. */
export function clampCamera(camera: Camera): Camera {
  const clampOffset = (v: unknown, fallback: number) => Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, finiteOr(v, fallback)));
  return {
    x: clampOffset(camera.x, DEFAULT_CAMERA.x),
    y: clampOffset(camera.y, DEFAULT_CAMERA.y),
    zoom: clampZoom(camera.zoom),
  };
}

export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return clampCamera({ ...camera, x: camera.x + dx, y: camera.y + dy });
}

/** Zooms by `factor` keeping the world point under `point` (screen space) in place. */
export function zoomAt(camera: Camera, factor: number, point: Point): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  const k = zoom / camera.zoom;
  return clampCamera({
    zoom,
    x: point.x - (point.x - camera.x) * k,
    y: point.y - (point.y - camera.y) * k,
  });
}

/** Wheel delta to zoom factor. Trackpad pinches arrive as small deltas, mouse wheels as large ones. */
export function wheelZoomFactor(deltaY: number): number {
  const clamped = Math.max(-100, Math.min(100, finiteOr(deltaY, 0)));
  return Math.exp(-clamped * 0.01);
}

/** Wheel deltas in pixels, whatever unit the browser reported. */
export function wheelPixels(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}

/**
 * Two-finger gesture: the world point under the starting midpoint follows
 * the current midpoint, and the zoom scales with the finger spread.
 */
export function pinchCamera(start: Camera, startMid: Point, startDistance: number, mid: Point, distance: number): Camera {
  const zoom = clampZoom(start.zoom * (startDistance > 0 ? distance / startDistance : 1));
  const worldX = (startMid.x - start.x) / start.zoom;
  const worldY = (startMid.y - start.y) / start.zoom;
  return clampCamera({ zoom, x: mid.x - worldX * zoom, y: mid.y - worldY * zoom });
}

/**
 * Shows the whole world rect, never above 100%. Centred horizontally; at the
 * top when it is taller than the screen at the smallest zoom.
 */
export function fitCamera(bounds: Rect, viewport: Size, padding = 48): Camera {
  if (bounds.width <= 0 || bounds.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return DEFAULT_CAMERA;
  const zoom = clampZoom(Math.min(
    (viewport.width - padding * 2) / bounds.width,
    (viewport.height - padding * 2) / bounds.height,
    1,
  ));
  return clampCamera({
    zoom,
    x: (viewport.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: Math.max(padding, (viewport.height - bounds.height * zoom) / 2) - bounds.y * zoom,
  });
}

/**
 * The smallest pan that brings a screen rect into view with a margin. A rect
 * larger than the screen is aligned to its top left corner.
 */
export function revealRect(camera: Camera, rect: Rect, viewport: Size, margin = 32): Camera {
  const shift = (start: number, size: number, limit: number) => {
    if (size + margin * 2 > limit || start < margin) return margin - start;
    if (start + size > limit - margin) return limit - margin - (start + size);
    return 0;
  };
  const dx = shift(rect.x, rect.width, viewport.width);
  const dy = shift(rect.y, rect.height, viewport.height);
  return dx === 0 && dy === 0 ? camera : panBy(camera, dx, dy);
}

// --- Storage ---------------------------------------------------------------

/** One key per project: this canvas only shows the annotate app. */
export const CAMERA_STORAGE_KEY = 'hypermark.canvas.annotate.camera';
export const CAMERA_STORAGE_VERSION = 1;
/** A stored camera is about 60 characters; anything much longer is not ours. */
const MAX_STORED_LENGTH = 512;

export function serializeCamera(camera: Camera): string {
  const { x, y, zoom } = clampCamera(camera);
  return JSON.stringify({ v: CAMERA_STORAGE_VERSION, camera: { x, y, zoom } });
}

/** The stored camera, or null when the value is missing, malformed, oversized or from an unknown version. */
export function parseStoredCamera(raw: string | null | undefined): Camera | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_STORED_LENGTH) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { v, camera } = data as { v?: unknown; camera?: unknown };
  if (v !== CAMERA_STORAGE_VERSION || !camera || typeof camera !== 'object') return null;
  const { x, y, zoom } = camera as Record<string, unknown>;
  if (![x, y, zoom].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return clampCamera({ x: x as number, y: y as number, zoom: zoom as number });
}

type ReadStorage = Pick<Storage, 'getItem' | 'removeItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;

/** Reads the saved camera. A value that can't be used is removed so it isn't read again. */
export function loadCamera(storage: ReadStorage | null): Camera | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CAMERA_STORAGE_KEY);
    const camera = parseStoredCamera(raw);
    if (raw !== null && !camera) storage.removeItem(CAMERA_STORAGE_KEY);
    return camera;
  } catch {
    return null;
  }
}

/** Saves the camera. Returns false when storage is unavailable or full. */
export function saveCamera(storage: WriteStorage | null, camera: Camera): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CAMERA_STORAGE_KEY, serializeCamera(camera));
    return true;
  } catch {
    return false;
  }
}
