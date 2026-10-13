import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Expand06, Moon01, RefreshCcw01, Sun, ZoomIn, ZoomOut } from '@untitledui/icons';
import { useTheme } from '@/ui/components/ThemeProvider';
import {
  DEFAULT_CAMERA,
  clampCamera,
  fitCamera,
  loadCamera,
  panBy,
  pinchCamera,
  revealRect,
  saveCamera,
  wheelPixels,
  wheelZoomFactor,
  zoomAt,
  type Camera,
  type Point,
} from './canvasCamera';

/**
 * The canvas shell: a full-screen surface with a pannable, zoomable world.
 * It knows nothing about the previews inside it; groups and slots are plain
 * layout. Previews keep their own pointer, wheel and keyboard input.
 */

const KEY_PAN_STEP = 80;
const KEY_PAN_STEP_LARGE = 400;
const BUTTON_ZOOM = 1.25;
/** A focus this soon after a pointer press came from the pointer, not the keyboard. */
const POINTER_FOCUS_MS = 150;

const getStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Whether `el` or an ancestor up to `stop` can still scroll in the wheel's direction. */
function canScrollWithin(el: Element | null, stop: Element, dx: number, dy: number): boolean {
  for (let node = el; node && node !== stop; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (dy !== 0 && /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
      if (dy > 0 ? node.scrollTop + node.clientHeight < node.scrollHeight - 1 : node.scrollTop > 0) return true;
    }
    if (dx !== 0 && /(auto|scroll|overlay)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) {
      if (dx > 0 ? node.scrollLeft + node.clientWidth < node.scrollWidth - 1 : node.scrollLeft > 0) return true;
    }
  }
  return false;
}

const ToolbarButton: React.FC<{ label: string; keys?: string; onClick: () => void; children: React.ReactNode }> = ({ label, keys, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    aria-keyshortcuts={keys}
    title={keys ? `${label} (${keys})` : label}
    onClick={onClick}
    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
  >
    {children}
  </button>
);

const ThemeToggle: React.FC = () => {
  const { resolvedMode, setMode } = useTheme();
  const next = resolvedMode === 'dark' ? 'light' : 'dark';
  return (
    <ToolbarButton label={`Switch to ${next} theme`} onClick={() => setMode(next)}>
      {resolvedMode === 'dark' ? <Sun className="size-4" /> : <Moon01 className="size-4" />}
    </ToolbarButton>
  );
};

export const CanvasShell: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>(DEFAULT_CAMERA);
  const frameRef = useRef(0);
  const saveTimerRef = useRef(0);
  const interactedRef = useRef(false);
  const [zoomPercent, setZoomPercent] = useState(100);

  const writeTransform = useCallback(() => {
    const { x, y, zoom } = cameraRef.current;
    if (worldRef.current) worldRef.current.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    // Anchored portals (the composer) re-measure on scroll. The camera moves
    // the page without scrolling it, so tell them.
    surfaceRef.current?.dispatchEvent(new Event('scroll'));
  }, []);

  /** Stores the camera and applies it on the next frame, at most once per frame. */
  const setCamera = useCallback((next: Camera, interacted = true) => {
    cameraRef.current = clampCamera(next);
    if (interacted) interactedRef.current = true;
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      writeTransform();
      setZoomPercent(Math.round(cameraRef.current.zoom * 100));
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => saveCamera(getStorage(), cameraRef.current), 250);
    });
  }, [writeTransform]);

  const viewportSize = () => ({
    width: surfaceRef.current?.clientWidth ?? window.innerWidth,
    height: surfaceRef.current?.clientHeight ?? window.innerHeight,
  });
  const viewportCenter = (): Point => {
    const { width, height } = viewportSize();
    return { x: width / 2, y: height / 2 };
  };

  const fitAll = useCallback((interacted = true) => {
    const content = contentRef.current;
    if (!content) return;
    setCamera(fitCamera({ x: 0, y: 0, width: content.offsetWidth, height: content.offsetHeight }, viewportSize()), interacted);
  }, [setCamera]);

  const resetView = useCallback(() => setCamera(DEFAULT_CAMERA), [setCamera]);

  /** Fits one group. Returns false when there is no group with that id. */
  const showGroup = useCallback((id: string): boolean => {
    const group = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[data-canvas-group]') ?? [])
      .find((el) => el.dataset.canvasGroup === id);
    if (!group) return false;
    setCamera(fitCamera({ x: group.offsetLeft, y: group.offsetTop, width: group.offsetWidth, height: group.offsetHeight }, viewportSize()));
    return true;
  }, [setCamera]);

  // First view: the saved camera, else the group in the URL hash, else
  // everything, once fonts have loaded and the layout has stopped changing.
  useLayoutEffect(() => {
    const stored = loadCamera(getStorage());
    if (stored) {
      cameraRef.current = stored;
      interactedRef.current = true;
      writeTransform();
      setZoomPercent(Math.round(stored.zoom * 100));
    } else {
      writeTransform();
    }

    const content = contentRef.current;
    if (!content) return;
    let done = false;
    let quietTimer = 0;
    const settle = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (hash && !stored && showGroup(hash)) return;
      if (!interactedRef.current) fitAll(false);
    };
    const observer = new ResizeObserver(() => {
      window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(settle, 250);
    });
    let maxTimer = 0;
    void document.fonts.ready.then(() => {
      if (done) return;
      observer.observe(content);
      maxTimer = window.setTimeout(settle, 2500);
    });
    return () => {
      done = true;
      observer.disconnect();
      window.clearTimeout(quietTimer);
      window.clearTimeout(maxTimer);
    };
  }, [fitAll, showGroup, writeTransform]);

  // Pointer, wheel, keyboard and focus handling. All native listeners, so
  // portals (which live outside the surface) never reach them.
  useEffect(() => {
    const surface = surfaceRef.current;
    const background = backgroundRef.current;
    const content = contentRef.current;
    if (!surface || !background || !content) return;

    const pointers = new Map<number, Point>();
    const captures = new Map<number, Element>();
    let start: { camera: Camera; points: Point[] } | null = null;
    let spaceHeld = false;
    let lastPointerDown = 0;

    const rebase = () => {
      start = pointers.size > 0 ? { camera: cameraRef.current, points: [...pointers.values()].slice(0, 2) } : null;
      surface.dataset.panning = pointers.size > 0 ? 'true' : 'false';
    };
    const endAll = () => {
      for (const [id, el] of captures) {
        try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch { /* already released */ }
      }
      captures.clear();
      pointers.clear();
      spaceHeld = false;
      delete surface.dataset.space;
      rebase();
    };
    const isPanTarget = (target: EventTarget | null) =>
      target instanceof Element && (target === background || target.hasAttribute('data-canvas-pan'));
    const toLocal = (e: { clientX: number; clientY: number }): Point => {
      const rect = surface.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      lastPointerDown = performance.now();
      const spacePan = spaceHeld && e.pointerType === 'mouse';
      if (!spacePan && !isPanTarget(e.target)) return;
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      e.preventDefault();
      const target = e.target as Element;
      try {
        target.setPointerCapture(e.pointerId);
        captures.set(e.pointerId, target);
      } catch { /* the pointer is already gone */ }
      pointers.set(e.pointerId, toLocal(e));
      rebase();
      if (!spacePan) surface.focus({ preventScroll: true });
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !start) return;
      pointers.set(e.pointerId, toLocal(e));
      const points = [...pointers.values()];
      if (points.length >= 2 && start.points.length >= 2) {
        const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
        setCamera(pinchCamera(
          start.camera,
          mid(start.points[0], start.points[1]), dist(start.points[0], start.points[1]),
          mid(points[0], points[1]), dist(points[0], points[1]),
        ));
      } else {
        setCamera(panBy(start.camera, points[0].x - start.points[0].x, points[0].y - start.points[0].y));
      }
    };
    const onPointerEnd = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      const el = captures.get(e.pointerId);
      captures.delete(e.pointerId);
      try { if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      rebase();
    };

    const onWheel = (e: WheelEvent) => {
      const page = surface.clientHeight;
      let dx = wheelPixels(e.deltaX, e.deltaMode, page);
      let dy = wheelPixels(e.deltaY, e.deltaMode, page);
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch, or Ctrl + wheel: zoom the canvas, never the page.
        e.preventDefault();
        setCamera(zoomAt(cameraRef.current, wheelZoomFactor(dy), toLocal(e)));
        return;
      }
      if (e.shiftKey && dx === 0) { dx = dy; dy = 0; }
      if (canScrollWithin(e.target as Element, surface, dx, dy)) return;
      e.preventDefault();
      setCamera(panBy(cameraRef.current, -dx, -dy));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Only the shell itself: keys inside previews belong to the previews.
      if (e.target !== surface || e.altKey || e.ctrlKey || e.metaKey) return;
      const step = e.shiftKey ? KEY_PAN_STEP_LARGE : KEY_PAN_STEP;
      const center = { x: surface.clientWidth / 2, y: surface.clientHeight / 2 };
      const camera = cameraRef.current;
      let next: Camera | null = null;
      switch (e.key) {
        case ' ':
          spaceHeld = true;
          surface.dataset.space = 'true';
          e.preventDefault();
          return;
        case 'ArrowLeft': next = panBy(camera, step, 0); break;
        case 'ArrowRight': next = panBy(camera, -step, 0); break;
        case 'ArrowUp': next = panBy(camera, 0, step); break;
        case 'ArrowDown': next = panBy(camera, 0, -step); break;
        case '+':
        case '=': next = zoomAt(camera, BUTTON_ZOOM, center); break;
        case '-': next = zoomAt(camera, 1 / BUTTON_ZOOM, center); break;
        case '0': resetView(); e.preventDefault(); return;
        case '1': fitAll(); e.preventDefault(); return;
        default: return;
      }
      e.preventDefault();
      setCamera(next);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceHeld = false;
        delete surface.dataset.space;
      }
    };

    // Keyboard focus that lands off screen pulls the camera to it.
    const onFocusIn = (e: FocusEvent) => {
      if (performance.now() - lastPointerDown < POINTER_FOCUS_MS) return;
      const target = e.target as Element;
      requestAnimationFrame(() => {
        if (!target.isConnected) return;
        const rect = target.getBoundingClientRect();
        const box = surface.getBoundingClientRect();
        const local = { x: rect.left - box.left, y: rect.top - box.top, width: rect.width, height: rect.height };
        setCamera(revealRect(cameraRef.current, local, { width: box.width, height: box.height }));
      });
    };
    // The browser scrolls clipped ancestors to show a focused element; the
    // camera does that job, so undo the scroll.
    const onScroll = () => {
      if (surface.scrollTop !== 0 || surface.scrollLeft !== 0) {
        surface.scrollTop = 0;
        surface.scrollLeft = 0;
      }
    };
    const onVisibility = () => { if (document.hidden) endAll(); };

    surface.addEventListener('pointerdown', onPointerDown);
    surface.addEventListener('pointermove', onPointerMove);
    surface.addEventListener('pointerup', onPointerEnd);
    surface.addEventListener('pointercancel', onPointerEnd);
    surface.addEventListener('lostpointercapture', onPointerEnd);
    surface.addEventListener('wheel', onWheel, { passive: false });
    surface.addEventListener('keydown', onKeyDown);
    surface.addEventListener('scroll', onScroll);
    content.addEventListener('focusin', onFocusIn);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', endAll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      endAll();
      surface.removeEventListener('pointerdown', onPointerDown);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerup', onPointerEnd);
      surface.removeEventListener('pointercancel', onPointerEnd);
      surface.removeEventListener('lostpointercapture', onPointerEnd);
      surface.removeEventListener('wheel', onWheel);
      surface.removeEventListener('keydown', onKeyDown);
      surface.removeEventListener('scroll', onScroll);
      content.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', endAll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fitAll, resetView, setCamera]);

  // Links. Group links (#id) move the camera. A link that would leave the
  // canvas opens in a new tab instead, from previews and their portals alike.
  // Runs after the previews' own handlers, which may have handled it already.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute('href') ?? '';
      if (href.startsWith('#')) {
        if (showGroup(decodeURIComponent(href.slice(1)))) {
          e.preventDefault();
          window.history.replaceState(null, '', href);
        }
        return;
      }
      if (link.target === '_blank') return;
      let url: URL;
      try {
        url = new URL(link.href);
      } catch {
        return;
      }
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) return;
      e.preventDefault();
      if (url.protocol === 'http:' || url.protocol === 'https:') window.open(url.href, '_blank', 'noopener,noreferrer');
    };
    const onHashChange = () => { showGroup(decodeURIComponent(window.location.hash.slice(1))); };
    window.addEventListener('click', onClick);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('click', onClick);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [showGroup]);

  useEffect(() => () => {
    cancelAnimationFrame(frameRef.current);
    window.clearTimeout(saveTimerRef.current);
  }, []);

  const zoomBy = (factor: number) => setCamera(zoomAt(cameraRef.current, factor, viewportCenter()));

  return (
    <>
      <div
        ref={surfaceRef}
        tabIndex={0}
        role="region"
        aria-roledescription="canvas"
        aria-label={`${label}. Arrow keys pan, plus and minus zoom, 1 fits everything, 0 resets.`}
        className="group/canvas fixed inset-0 overflow-hidden bg-background outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[panning=true]:cursor-grabbing data-[space=true]:cursor-grab"
      >
        <div ref={backgroundRef} className="absolute inset-0 touch-none" />
        <div ref={worldRef} className="pointer-events-none absolute left-0 top-0 origin-top-left will-change-transform">
          <div ref={contentRef} className="relative flex w-1400 flex-wrap items-start gap-x-40 gap-y-32">
            {children}
          </div>
        </div>
      </div>

      <div role="toolbar" aria-label="Canvas view" className="fixed bottom-4 right-4 z-chrome flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md">
        <ToolbarButton label="Fit all" keys="1" onClick={() => fitAll()}><Expand06 className="size-4" /></ToolbarButton>
        <ToolbarButton label="Reset view" keys="0" onClick={resetView}><RefreshCcw01 className="size-4" /></ToolbarButton>
        <ToolbarButton label="Zoom out" keys="-" onClick={() => zoomBy(1 / BUTTON_ZOOM)}><ZoomOut className="size-4" /></ToolbarButton>
        <output aria-label="Zoom" className="w-11 text-center text-caption tabular-nums text-muted-foreground">{zoomPercent}%</output>
        <ToolbarButton label="Zoom in" keys="+" onClick={() => zoomBy(BUTTON_ZOOM)}><ZoomIn className="size-4" /></ToolbarButton>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <ThemeToggle />
      </div>
    </>
  );
};

/**
 * A titled group with a dashed border. Its slots share one width and fill
 * each row. The title, border and padding are pan handles; slots are not.
 */
export const CanvasGroup: React.FC<{
  id: string;
  title: string;
  columns: number;
  slotWidth: number;
  children: React.ReactNode;
}> = ({ id, title, columns, slotWidth, children }) => (
  <section data-canvas-group={id} aria-labelledby={`canvas-group-${id}`} className="pointer-events-auto relative shrink-0">
    <h2 id={`canvas-group-${id}`} data-canvas-pan className="mb-2 select-none text-body text-muted-foreground">{title}</h2>
    <div
      data-canvas-pan
      className="grid items-start gap-x-16 gap-y-14 rounded-2xl border border-dashed border-muted-foreground/25 p-12"
      style={{ gridTemplateColumns: `repeat(${columns}, ${slotWidth}px)` }}
    >
      {children}
    </div>
  </section>
);

/** One example in a group, with a short label above it. */
export const CanvasSlot: React.FC<{ label: string; span?: number; children: React.ReactNode }> = ({ label, span, children }) => (
  <div className="flex min-w-0 flex-col gap-3" style={span ? { gridColumn: `span ${span}` } : undefined}>
    <p data-canvas-pan className="select-none text-caption text-muted-foreground">{label}</p>
    {children}
  </div>
);
