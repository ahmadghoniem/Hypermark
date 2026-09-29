import { useEffect, useMemo, useSyncExternalStore } from 'react';

export interface ViewportEnvironmentInput {
  layoutWidth: number;
  layoutHeight: number;
}

export interface ViewportEnvironment {
  width: number;
  height: number;
}

export interface ViewportEdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface VisibleViewportBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

const ZERO_ENVIRONMENT: ViewportEnvironment = {
  width: 0,
  height: 0,
};

const ZERO_INSETS: ViewportEdgeInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

const VIEWPORT_PROPERTIES = [
  '--pn-viewport-width',
  '--pn-viewport-height',
] as const;

type ViewportProperty = (typeof VIEWPORT_PROPERTIES)[number];

let subscriberCount = 0;
let stopObserving: (() => void) | null = null;
let currentEnvironment: ViewportEnvironment | null = null;
const environmentListeners = new Set<() => void>();

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateViewportEnvironment({
  layoutWidth,
  layoutHeight,
}: ViewportEnvironmentInput): ViewportEnvironment {
  const safeLayoutWidth = Math.max(0, finiteOr(layoutWidth, 0));
  const safeLayoutHeight = Math.max(0, finiteOr(layoutHeight, 0));

  return {
    width: rounded(safeLayoutWidth),
    height: rounded(safeLayoutHeight),
  };
}

export function calculateVisibleViewportBounds(
  environment: ViewportEnvironment,
  edgePadding = 0,
  insets: Partial<ViewportEdgeInsets> = ZERO_INSETS,
): VisibleViewportBounds {
  const padding = Math.max(0, finiteOr(edgePadding, 0));
  const safeInsets = {
    top: Math.max(0, finiteOr(insets.top ?? 0, 0)),
    right: Math.max(0, finiteOr(insets.right ?? 0, 0)),
    bottom: Math.max(0, finiteOr(insets.bottom ?? 0, 0)),
    left: Math.max(0, finiteOr(insets.left ?? 0, 0)),
  };
  const left = padding + safeInsets.left;
  const top = padding + safeInsets.top;
  const right = Math.max(
    left,
    environment.width - padding - safeInsets.right,
  );
  const bottom = Math.max(
    top,
    environment.height - padding - safeInsets.bottom,
  );

  return {
    top: rounded(top),
    right: rounded(right),
    bottom: rounded(bottom),
    left: rounded(left),
    width: rounded(Math.max(0, right - left)),
    height: rounded(Math.max(0, bottom - top)),
  };
}

function readViewportEnvironment(targetWindow: Window): ViewportEnvironment {
  return calculateViewportEnvironment({
    layoutWidth: targetWindow.innerWidth,
    layoutHeight: targetWindow.innerHeight,
  });
}

function environmentsEqual(
  left: ViewportEnvironment | null,
  right: ViewportEnvironment,
): boolean {
  return !!left
    && left.width === right.width
    && left.height === right.height;
}

function getViewportEnvironmentSnapshot(): ViewportEnvironment {
  if (currentEnvironment) return currentEnvironment;
  if (typeof window === 'undefined') return ZERO_ENVIRONMENT;
  currentEnvironment = readViewportEnvironment(window);
  return currentEnvironment;
}

function cssValues(environment: ViewportEnvironment): Record<ViewportProperty, string> {
  return {
    '--pn-viewport-width': `${environment.width}px`,
    '--pn-viewport-height': `${environment.height}px`,
  };
}

function startViewportEnvironmentObserver(
  targetWindow: Window,
  targetDocument: Document,
): () => void {
  const rootStyle = targetDocument.documentElement.style;
  const previousValues = new Map<ViewportProperty, string>();
  const writtenValues = new Map<ViewportProperty, string>();
  for (const property of VIEWPORT_PROPERTIES) {
    previousValues.set(property, rootStyle.getPropertyValue(property));
  }

  let animationFrame: number | null = null;

  const write = () => {
    animationFrame = null;
    const nextEnvironment = readViewportEnvironment(targetWindow);
    const changed = !environmentsEqual(currentEnvironment, nextEnvironment);
    currentEnvironment = nextEnvironment;
    const nextValues = cssValues(nextEnvironment);
    for (const property of VIEWPORT_PROPERTIES) {
      const nextValue = nextValues[property];
      if (writtenValues.get(property) === nextValue) continue;
      rootStyle.setProperty(property, nextValue);
      writtenValues.set(property, nextValue);
    }
    if (changed) environmentListeners.forEach(listener => listener());
  };

  const scheduleWrite = () => {
    if (animationFrame !== null) return;
    animationFrame = targetWindow.requestAnimationFrame(write);
  };

  targetWindow.addEventListener('resize', scheduleWrite);
  targetWindow.addEventListener('orientationchange', scheduleWrite);
  targetWindow.addEventListener('pageshow', scheduleWrite);
  targetDocument.addEventListener('visibilitychange', scheduleWrite);
  write();

  return () => {
    targetWindow.removeEventListener('resize', scheduleWrite);
    targetWindow.removeEventListener('orientationchange', scheduleWrite);
    targetWindow.removeEventListener('pageshow', scheduleWrite);
    targetDocument.removeEventListener('visibilitychange', scheduleWrite);
    if (animationFrame !== null) targetWindow.cancelAnimationFrame(animationFrame);

    for (const property of VIEWPORT_PROPERTIES) {
      const previousValue = previousValues.get(property) ?? '';
      if (previousValue) rootStyle.setProperty(property, previousValue);
      else rootStyle.removeProperty(property);
    }
  };
}

function acquireViewportEnvironment(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  subscriberCount += 1;
  if (subscriberCount === 1) {
    stopObserving = startViewportEnvironmentObserver(window, document);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount !== 0) return;
    stopObserving?.();
    stopObserving = null;
    currentEnvironment = null;
  };
}

function subscribeViewportEnvironment(listener: () => void): () => void {
  environmentListeners.add(listener);
  const release = acquireViewportEnvironment();
  return () => {
    environmentListeners.delete(listener);
    release();
  };
}

/**
 * Keeps Hypermark's shared viewport CSS properties synchronized without
 * putting high-frequency browser geometry into React state.
 */
export function useViewportEnvironment(): void {
  useEffect(() => acquireViewportEnvironment(), []);
}

/**
 * Reactive bounds for fixed overlays.
 */
export function useVisibleViewportBounds(edgePadding = 0): VisibleViewportBounds {
  const environment = useSyncExternalStore(
    subscribeViewportEnvironment,
    getViewportEnvironmentSnapshot,
    () => ZERO_ENVIRONMENT,
  );
  return useMemo(
    () => calculateVisibleViewportBounds(environment, edgePadding),
    [edgePadding, environment],
  );
}
