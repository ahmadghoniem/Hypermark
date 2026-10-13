import { describe, expect, test } from 'bun:test';
import {
  CAMERA_STORAGE_KEY,
  DEFAULT_CAMERA,
  MAX_ZOOM,
  MIN_ZOOM,
  clampCamera,
  fitCamera,
  loadCamera,
  parseStoredCamera,
  pinchCamera,
  revealRect,
  saveCamera,
  serializeCamera,
  wheelPixels,
  zoomAt,
} from './canvasCamera';

const memoryStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
};

describe('camera math', () => {
  test('clampCamera replaces non-finite values and keeps zoom in range', () => {
    expect(clampCamera({ x: NaN, y: Infinity, zoom: NaN })).toEqual(DEFAULT_CAMERA);
    expect(clampCamera({ x: 0, y: 0, zoom: 100 }).zoom).toBe(MAX_ZOOM);
    expect(clampCamera({ x: 0, y: 0, zoom: 0 }).zoom).toBe(MIN_ZOOM);
    expect(clampCamera({ x: 1e9, y: -1e9, zoom: 1 })).toEqual({ x: 200_000, y: -200_000, zoom: 1 });
  });

  test('zoomAt keeps the point under the cursor fixed', () => {
    const camera = { x: 10, y: 20, zoom: 1 };
    const point = { x: 300, y: 200 };
    const next = zoomAt(camera, 2, point);
    const before = { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
    const after = { x: (point.x - next.x) / next.zoom, y: (point.y - next.y) / next.zoom };
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.zoom).toBe(2);
  });

  test('pinchCamera follows the midpoint and scales with the spread', () => {
    const start = { x: 0, y: 0, zoom: 1 };
    const next = pinchCamera(start, { x: 100, y: 100 }, 50, { x: 150, y: 120 }, 100);
    expect(next.zoom).toBe(2);
    // World point (100, 100) is now under (150, 120).
    expect(100 * next.zoom + next.x).toBeCloseTo(150);
    expect(100 * next.zoom + next.y).toBeCloseTo(120);
  });

  test('fitCamera shows the whole rect and never zooms past 100%', () => {
    const small = fitCamera({ x: 0, y: 0, width: 200, height: 100 }, { width: 1000, height: 800 });
    expect(small.zoom).toBe(1);
    const big = fitCamera({ x: 0, y: 0, width: 4000, height: 2000 }, { width: 1000, height: 800 }, 50);
    expect(big.zoom).toBeCloseTo(900 / 4000);
    expect(big.x + 4000 * big.zoom).toBeLessThanOrEqual(1000);
    expect(fitCamera({ x: 0, y: 0, width: 0, height: 0 }, { width: 1000, height: 800 })).toEqual(DEFAULT_CAMERA);
  });

  test('revealRect pans only as far as needed', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const viewport = { width: 1000, height: 800 };
    expect(revealRect(camera, { x: 100, y: 100, width: 50, height: 20 }, viewport)).toBe(camera);
    expect(revealRect(camera, { x: 1100, y: 100, width: 50, height: 20 }, viewport, 32).x).toBe(-182);
    expect(revealRect(camera, { x: 100, y: -40, width: 50, height: 20 }, viewport, 32).y).toBe(72);
  });

  test('wheelPixels converts lines and pages', () => {
    expect(wheelPixels(3, 0, 800)).toBe(3);
    expect(wheelPixels(3, 1, 800)).toBe(48);
    expect(wheelPixels(1, 2, 800)).toBe(800);
  });
});

describe('camera storage', () => {
  test('round trips', () => {
    const camera = { x: 12.5, y: -40, zoom: 0.75 };
    expect(parseStoredCamera(serializeCamera(camera))).toEqual(camera);
  });

  test('rejects malformed, oversized and unknown versions', () => {
    expect(parseStoredCamera(null)).toBeNull();
    expect(parseStoredCamera('{')).toBeNull();
    expect(parseStoredCamera('"text"')).toBeNull();
    expect(parseStoredCamera(JSON.stringify({ v: 2, camera: { x: 0, y: 0, zoom: 1 } }))).toBeNull();
    expect(parseStoredCamera(JSON.stringify({ x: 0, y: 0, zoom: 1 }))).toBeNull();
    expect(parseStoredCamera(JSON.stringify({ v: 1, camera: { x: '0', y: 0, zoom: 1 } }))).toBeNull();
    expect(parseStoredCamera(JSON.stringify({ v: 1, camera: { x: 0, y: 0, zoom: 1 }, pad: 'x'.repeat(600) }))).toBeNull();
  });

  test('clamps stored values that are out of range', () => {
    expect(parseStoredCamera(JSON.stringify({ v: 1, camera: { x: 0, y: 0, zoom: 50 } }))?.zoom).toBe(MAX_ZOOM);
  });

  test('loadCamera removes a value it cannot use', () => {
    const storage = memoryStorage({ [CAMERA_STORAGE_KEY]: 'garbage' });
    expect(loadCamera(storage)).toBeNull();
    expect(storage.map.has(CAMERA_STORAGE_KEY)).toBe(false);
  });

  test('storage failures fall back safely', () => {
    const throwing = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(loadCamera(throwing)).toBeNull();
    expect(saveCamera(throwing, DEFAULT_CAMERA)).toBe(false);
    expect(loadCamera(null)).toBeNull();
    expect(saveCamera(null, DEFAULT_CAMERA)).toBe(false);
  });

  test('saveCamera writes the versioned format', () => {
    const storage = memoryStorage();
    expect(saveCamera(storage, { x: 1, y: 2, zoom: 0.5 })).toBe(true);
    expect(JSON.parse(storage.map.get(CAMERA_STORAGE_KEY)!)).toEqual({ v: 1, camera: { x: 1, y: 2, zoom: 0.5 } });
  });
});
