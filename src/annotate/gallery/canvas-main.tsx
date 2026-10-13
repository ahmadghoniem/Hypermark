// First: route settings writes away from the real app's cookies.
import './canvasSandbox';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import { ThemeProvider, useTheme } from '@/ui/components/ThemeProvider';
import { TooltipProvider } from '@/ui/components/Tooltip';
import { FluidRoot } from '@/ui/fluid/components/fluid-root';
import { CanvasGroup, CanvasShell, CanvasSlot } from './Canvas';
import { CANVAS_GROUPS, CANVAS_OMISSIONS } from './canvasManifest';
import { CANVAS_RENDERERS, CanvasState } from './CanvasGroups';
import './canvas.css';

const ThemedToaster: React.FC = () => {
  const { resolvedMode } = useTheme();
  return <Toaster theme={resolvedMode} position="bottom-center" />;
};

/** A card on the canvas listing the groups (as links) and what is left out. */
const Index: React.FC = () => (
  <section data-canvas-group="index" aria-label="About this canvas" className="pointer-events-auto w-120 shrink-0 rounded-2xl border border-border bg-card p-8">
    <h1 data-canvas-pan className="text-title font-semibold text-foreground">Annotate components</h1>
    <p data-canvas-pan className="mt-2 text-caption text-muted-foreground">
      Dev only. Drag the background to pan, Ctrl + wheel or pinch to zoom. Settings changed here last until the tab closes.
    </p>
    <nav aria-label="Groups" className="mt-5 flex flex-wrap gap-1.5">
      {CANVAS_GROUPS.map((g) => (
        <a key={g.id} href={`#${g.id}`} className="rounded-md bg-muted px-2 py-1 text-caption text-foreground transition-colors hover:bg-muted/70">
          {g.title}
        </a>
      ))}
    </nav>
    <h2 data-canvas-pan className="mt-6 text-body font-semibold text-foreground">Not shown</h2>
    <ul className="mt-2 flex flex-col gap-2 text-caption text-muted-foreground">
      {CANVAS_OMISSIONS.map((o) => (
        <li key={o.what}><span className="text-foreground">{o.what}.</span> {o.why}</li>
      ))}
    </ul>
  </section>
);

const CanvasApp: React.FC = () => (
  <ThemeProvider defaultTheme="dark">
    <FluidRoot>
      <TooltipProvider delayDuration={300}>
        <CanvasState>
          <CanvasShell label="Annotate component canvas">
            <Index />
            {CANVAS_GROUPS.map((group) => {
              const renderers = CANVAS_RENDERERS[group.id] as Record<string, () => React.ReactNode>;
              return (
                <CanvasGroup key={group.id} id={group.id} title={group.title} columns={group.columns} slotWidth={group.slotWidth}>
                  {group.slots.map((slot) => (
                    <CanvasSlot key={slot.id} label={slot.label}>{renderers[slot.id]()}</CanvasSlot>
                  ))}
                </CanvasGroup>
              );
            })}
          </CanvasShell>
        </CanvasState>
        <ThemedToaster />
      </TooltipProvider>
    </FluidRoot>
  </ThemeProvider>
);

// No StrictMode: its second ref pass leaves Pierre's code view (the code
// popout) empty in dev. Real sessions run the production build, which has no
// second pass.
ReactDOM.createRoot(document.getElementById('root')!).render(<CanvasApp />);
