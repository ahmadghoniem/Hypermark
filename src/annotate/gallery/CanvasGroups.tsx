import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Copy01, Download01, Keyboard01, Moon01, Plus, Settings01, Tag01 } from '@untitledui/icons';
import { toast } from 'sonner';

import { Button as NowButton } from '@/ui/components/ui/button';
import { CommentPopover } from '@/ui/components/CommentPopover';
import { AnnotationPanel, type AnnotationScope } from '@/ui/components/AnnotationPanel';
import { MessageRail, type PickerMessage } from '@/ui/components/MessageRail';
import { DecisionControl, type DecisionHandler } from '@/ui/components/DecisionControl';
import { buildDecisionSpec, type DecisionActionId } from '@/ui/utils/decisionSpec';
import { AppHeader } from '@/annotate/components/AppHeader';
import { TableOfContents } from '@/ui/components/TableOfContents';
import { KeyboardShortcutsDialog } from '@/ui/components/KeyboardShortcutsDialog';
import { QuickLabelsButton } from '@/ui/components/QuickLabelsSettings';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { CodeFilePopout } from '@/ui/components/CodeFilePopout';
import { CodeFilePicker } from '@/ui/components/CodeFilePicker';
import { CompletionOverlay } from '@/ui/components/CompletionOverlay';
import { Viewer } from '@/ui/components/Viewer';
import { BlockRenderer } from '@/ui/components/BlockRenderer';
import { BlockOutline } from '@/ui/components/BlockOutline';
import { TabHint } from '@/ui/components/TabHint';
import { PlanDiffBadge } from '@/ui/components/plan-diff/PlanDiffBadge';
import { PlanDiffViewer } from '@/ui/components/plan-diff/PlanDiffViewer';
import { StickyHeaderLane } from '@/ui/components/StickyHeaderLane';
import { VersionBrowser } from '@/ui/components/sidebar/VersionBrowser';
import { parseMarkdownToBlocks } from '@/ui/utils/parser';
import { computePlanDiff } from '@/ui/utils/planDiffEngine';
import { DEFAULT_QUICK_LABELS, type QuickLabel } from '@/ui/utils/quickLabels';
import { AnnotationType, type Annotation, type CodeAnnotation } from '@/ui/types';

import { Button } from '@/ui/fluid/components/button';
import { TabsSubtle, TabsSubtleItem } from '@/ui/fluid/components/tabs-subtle';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose,
} from '@/ui/fluid/components/dialog';
import {
  CommandMenu, CommandMenuInput, CommandMenuList, CommandMenuEmpty, type CommandMenuItemData,
} from '@/ui/fluid/components/command-menu';

import { NewComposer } from './NewComposer';
import { SideChatDemo, type SideChatLayout } from './SideChat';
import type { CanvasRenderers } from './canvasManifest';
import {
  CODE_CONTENTS, CODE_MATCHES, CODE_PATH, PANEL_ANNOTATIONS, PANEL_CODE_ANNOTATIONS, PLAN_V1, PLAN_V2, QUOTE,
  RAIL_GROUPS, RAIL_LONG_ONLY, RAIL_MESSAGES, SAMPLE_MARKDOWN, TAB_MARKDOWN, VERSIONS, VERSION_INFO, annotation,
} from './canvasData';

const HIGHLIGHT = 'w-fit bg-[oklch(0.86_0.17_95/0.35)] text-body text-foreground';
const FRAME = 'overflow-hidden rounded-lg border border-border bg-background';

const say = (message: string) => () => { toast(message); };

// --- Composer ---------------------------------------------------------------

/** Which composer is open. One at a time, as in the app. */
const OpenComposer = createContext<[string | null, (id: string | null) => void]>([null, () => {}]);

const NowComposerSlot: React.FC<{
  id: string;
  isGlobal?: boolean;
  initialText?: string;
}> = ({ id, isGlobal = false, initialText }) => {
  const [openId, setOpenId] = useContext(OpenComposer);
  // Anchored like the app: to the highlight, or to the + for a global comment.
  const highlightRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const anchor = isGlobal ? buttonRef.current : highlightRef.current;
  const open = openId === id;
  const close = () => setOpenId(null);
  return (
    <div className="flex flex-col items-start gap-3">
      {isGlobal ? (
        <p className="text-caption text-muted-foreground">Opens from the + next to the panel title.</p>
      ) : (
        <span ref={highlightRef} className={HIGHLIGHT}>still open and the link text runs into someCode()</span>
      )}
      <NowButton ref={buttonRef} size="xs" variant="outline" onClick={() => setOpenId(open ? null : id)}>
        {isGlobal && <Plus className="size-3.5" />}
        {open ? 'Close composer' : 'Open composer'}
      </NowButton>
      {open && anchor && (
        <CommentPopover
          anchorEl={anchor}
          contextText={isGlobal ? '' : QUOTE}
          copyText={isGlobal ? undefined : QUOTE}
          isGlobal={isGlobal}
          initialText={initialText}
          quickLabels={DEFAULT_QUICK_LABELS}
          onQuickLabel={(label: QuickLabel) => { toast(`Label: ${label.text}`); close(); }}
          onSubmit={(text) => { toast(`Saved: ${text}`); close(); }}
          onClose={close}
        />
      )}
    </div>
  );
};

const useComposerProps = () => {
  const [labels, setLabels] = useState<QuickLabel[]>([...DEFAULT_QUICK_LABELS]);
  return {
    quickLabels: labels,
    sendIcon: ArrowUp,
    sendVariant: 'primary' as const,
    onSubmit: (text: string, files: File[]) => toast(`Added: ${text || '(no text)'}${files.length ? ` + ${files.length} image(s)` : ''}`),
    onSaveLabel: (text: string) => {
      setLabels((prev) => [...prev, { id: text.toLowerCase().split(' ').join('-'), emoji: '', text }]);
      toast(`Saved "${text}" as a quick label`);
    },
  };
};

const FluidComposerSlot: React.FC = () => {
  const props = useComposerProps();
  return <NewComposer quote={QUOTE} {...props} autoFocus={false} onAsk={(q) => toast(`Side question: ${q || '(empty)'}`)} />;
};

// --- Annotations panel ------------------------------------------------------

const PanelSlot: React.FC<{
  annotations?: Annotation[];
  codeAnnotations?: CodeAnnotation[];
  selected?: string | null;
  scope?: AnnotationScope;
}> = ({ annotations: initial = [], codeAnnotations: initialCode = [], selected = null, scope: initialScope }) => {
  const [annotations, setAnnotations] = useState(initial);
  const [codeAnnotations, setCodeAnnotations] = useState(initialCode);
  const [selectedId, setSelectedId] = useState<string | null>(selected);
  const [scope, setScope] = useState<AnnotationScope>(initialScope ?? 'this');
  return (
    <div className={`${FRAME} flex h-120 justify-end`}>
      <AnnotationPanel
        isOpen
        annotations={annotations}
        blocks={[]}
        codeAnnotations={codeAnnotations}
        selectedId={selectedId}
        onSelectAnnotation={(id) => setSelectedId((prev) => (prev === id ? null : id))}
        onDeleteAnnotation={(id) => setAnnotations((prev) => prev.filter((a) => a.id !== id))}
        onEditAnnotation={(id, updates) => setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)))}
        onSelectCodeAnnotation={(id) => setSelectedId((prev) => (prev === id ? null : id))}
        onDeleteCodeAnnotation={(id) => setCodeAnnotations((prev) => prev.filter((a) => a.id !== id))}
        onEditCodeAnnotation={(id, updates) => setCodeAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)))}
        scope={initialScope ? scope : undefined}
        onScopeChange={initialScope ? setScope : undefined}
        messageGroups={initialScope ? RAIL_GROUPS : undefined}
        onAddGlobalComment={say('Opens the global composer')}
      />
    </div>
  );
};

const FluidScopeSlot: React.FC = () => {
  const [tab, setTab] = useState(0);
  return (
    <TabsSubtle idPrefix="canvas-scope" size="compact" selectedIndex={tab} onSelect={setTab}>
      <TabsSubtleItem index={0} label="Current" />
      <TabsSubtleItem index={1} label="All" />
    </TabsSubtle>
  );
};

// --- Message rail -----------------------------------------------------------

const RailSlot: React.FC<{ messages: PickerMessage[]; selected: string; showShort: boolean }> = ({ messages, selected, showShort: initialShowShort }) => {
  const [selectedId, setSelectedId] = useState(selected);
  const [showShort, setShowShort] = useState(initialShowShort);
  return (
    <div className="flex h-56 items-center justify-end">
      <MessageRail
        messages={messages}
        selectedMessageId={selectedId}
        onSelect={setSelectedId}
        showShort={showShort}
        onShowShortChange={setShowShort}
      />
    </div>
  );
};

// --- Send control -----------------------------------------------------------

const DECISION_HANDLERS: Record<DecisionActionId, DecisionHandler> = {
  'primary': say('Primary action'),
  'note-with-approval': (note) => toast(`Approve with a note: ${note ?? ''}`),
  'request-changes': (note) => toast(`Request changes: ${note ?? ''}`),
  'note-with-feedback': (note) => toast(`Send with a note: ${note ?? ''}`),
  'approve-with-notes': say('Approve with notes'),
  'close-session': say('Close session'),
};

const decisionSpec = (gate: boolean, count: number) =>
  buildDecisionSpec({ app: 'annotate', gate, count, hasFeedback: count > 0, approvalNotesSupported: true });

const SendSlot: React.FC<{ gate: boolean; count: number }> = ({ gate, count }) => (
  <div className="flex justify-start">
    <DecisionControl spec={decisionSpec(gate, count)} handlers={DECISION_HANDLERS} busy={false} isLoading={false} />
  </div>
);

// --- Header -----------------------------------------------------------------

const COMMANDS: CommandMenuItemData[] = [
  { value: 'theme', label: 'Toggle light / dark', icon: Moon01, group: 'View' },
  { value: 'labels', label: 'Edit quick labels', icon: Tag01, group: 'Settings' },
  { value: 'diff', label: 'Diff options', icon: Settings01, group: 'Settings' },
  { value: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard01, shortcut: 'shift+?', group: 'Help' },
  { value: 'copy', label: 'Copy document', icon: Copy01, group: 'Export' },
  { value: 'download', label: 'Download annotations', icon: Download01, group: 'Export' },
];

const HEADER_DECISION = {
  spec: decisionSpec(false, 3),
  handlers: DECISION_HANDLERS,
  closeTitle: 'Dismiss without telling the agent',
};

// --- Table of contents ------------------------------------------------------

const useSampleBlocks = () => useMemo(() => parseMarkdownToBlocks(SAMPLE_MARKDOWN), []);

const TocSlot: React.FC<{ active?: boolean; counts?: boolean }> = ({ active = false, counts = false }) => {
  const blocks = useSampleBlocks();
  const headings = blocks.filter((b) => b.type === 'heading');
  const [activeId, setActiveId] = useState<string | null>(active ? headings[1]?.id ?? null : null);
  const annotations = useMemo(() => {
    if (!counts) return [];
    const at = (content: string) => blocks.find((b) => b.content.startsWith(content))?.id ?? '';
    return [
      annotation('t1', AnnotationType.COMMENT, 'keeps the file', 'Memory?', 3, { blockId: at('The uploader') }),
      annotation('t2', AnnotationType.DELETION, 'Three retries', undefined, 2, { blockId: at('Three retries') }),
      annotation('t3', AnnotationType.COMMENT, 'toast', 'Yes, a toast.', 1, { blockId: at('Show a toast') }),
    ];
  }, [blocks, counts]);
  return (
    <div className={`${FRAME} w-60 bg-card`}>
      <TableOfContents blocks={blocks} annotations={annotations} activeId={activeId} onNavigate={setActiveId} className="" />
    </div>
  );
};

// --- Dialogs ----------------------------------------------------------------

const ShortcutsSlot: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <NowButton size="sm" variant="outline" className="self-start" onClick={() => setOpen(true)}>Open shortcuts</NowButton>
      <KeyboardShortcutsDialog isOpen={open} onClose={() => setOpen(false)} mode="annotate" />
    </>
  );
};

const ConfirmSlot: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <NowButton size="sm" variant="outline" className="self-start" onClick={() => setOpen(true)}>Open confirm</NowButton>
      <ConfirmDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        title="Discard annotations?"
        message="This removes all 4 annotations on this message."
        confirmText="Discard"
        showCancel
        variant="warning"
      />
    </>
  );
};

const FluidDialogSlot: React.FC = () => (
  <Dialog>
    <DialogTrigger render={<Button size="compact" variant="tertiary" className="self-start">Open dialog</Button>} />
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>Discard annotations?</DialogTitle>
        <DialogDescription>This removes all 4 annotations on this message.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost">Cancel</Button>} />
        <DialogClose render={<Button>Discard</Button>} />
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// --- Code files -------------------------------------------------------------

const PopoutSlot: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [annotations, setAnnotations] = useState<CodeAnnotation[]>(PANEL_CODE_ANNOTATIONS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <>
      <NowButton size="sm" variant="outline" className="self-start" onClick={() => setOpen(true)}>Open {CODE_PATH}</NowButton>
      <CodeFilePopout
        open={open}
        onClose={() => setOpen(false)}
        filepath={CODE_PATH}
        contents={CODE_CONTENTS}
        annotations={annotations}
        selectedAnnotationId={selectedId}
        onSelectAnnotation={setSelectedId}
        onAddAnnotation={(input) => setAnnotations((prev) => [...prev, {
          id: `c-${Date.now()}`,
          type: 'comment',
          scope: 'line',
          side: 'new',
          createdAt: Date.now(),
          ...input,
        }])}
        onEditAnnotation={(id, updates) => setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)))}
        onDeleteAnnotation={(id) => setAnnotations((prev) => prev.filter((a) => a.id !== id))}
      />
    </>
  );
};

const PickerSlot: React.FC = () => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <div className="text-body text-foreground/90">
      The loop lives in{' '}
      <button
        type="button"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="cursor-pointer font-mono text-[0.9em] text-primary underline decoration-primary/40 underline-offset-2"
      >
        retry.ts
      </button>
      .
      {anchor && (
        <CodeFilePicker
          anchorEl={anchor}
          matches={CODE_MATCHES}
          onPick={(path) => { toast(`Opens ${path}`); setAnchor(null); }}
          onDismiss={() => setAnchor(null)}
        />
      )}
    </div>
  );
};

// --- Completion screen ------------------------------------------------------

const COMPLETION = {
  approved: { title: 'Approved', subtitle: 'Claude Code will proceed.' },
  feedback: { title: 'Feedback Sent', subtitle: 'Claude Code will address your feedback on the message.' },
  exited: { title: 'Session Closed', subtitle: 'Annotation session closed without feedback.' },
} as const;

/**
 * The overlay is full-screen (fixed). The frame's transform makes it the
 * overlay's containing block, so it fills the frame instead. Shown on click:
 * mounting it starts the three-second close.
 */
const CompletionSlot: React.FC<{ kind: keyof typeof COMPLETION }> = ({ kind }) => {
  const [run, setRun] = useState(0);
  return (
    <div className="flex flex-col gap-3">
      <NowButton size="xs" variant="outline" className="w-fit" onClick={() => setRun((n) => n + 1)}>
        {run ? 'Show again' : 'Show'}
      </NowButton>
      <div className={`${FRAME} relative h-90 transform-[translateZ(0)]`}>
        {run > 0 && (
          <CompletionOverlay key={run} submitted={kind} title={COMPLETION[kind].title} subtitle={COMPLETION[kind].subtitle} agentLabel="Claude Code" />
        )}
      </div>
    </div>
  );
};

// --- Document ---------------------------------------------------------------

const ViewerSlot: React.FC = () => {
  const blocks = useSampleBlocks();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div className={`${FRAME} py-6`}>
      <Viewer
        blocks={blocks}
        markdown={SAMPLE_MARKDOWN}
        annotations={annotations}
        onAddAnnotation={(a) => setAnnotations((prev) => [...prev, a])}
        onSelectAnnotation={setSelectedId}
        selectedAnnotationId={selectedId}
        maxWidth={760}
      />
    </div>
  );
};

// --- Tab selection ----------------------------------------------------------

/** A few rendered blocks with the Tab outline over the ones `pick` chooses. */
const TabSlot: React.FC<{ pick: (count: number) => number[] }> = ({ pick }) => {
  const blocks = useMemo(() => parseMarkdownToBlocks(TAB_MARKDOWN), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const [outlined, setOutlined] = useState<HTMLElement[]>([]);
  useLayoutEffect(() => {
    const all = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[data-block-id]') ?? []);
    setOutlined(pick(all.length).map((i) => all[i]).filter(Boolean));
  }, [pick]);
  return (
    <div ref={containerRef} className={`${FRAME} relative p-5`}>
      {blocks.map((block) => <BlockRenderer key={block.id} block={block} />)}
      <BlockOutline blocks={outlined} containerRef={containerRef} />
    </div>
  );
};

const PICK_ONE = () => [0];
const PICK_SEVERAL = () => [0, 1];
const PICK_LIST_CODE = (n: number) => [n - 3, n - 2, n - 1];

const HintBox: React.FC<{ mode: 'blocks' | 'back' }> = ({ mode }) => {
  const pointer = useRef({ x: 0, y: 0 });
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={(e) => { pointer.current = { x: e.clientX, y: e.clientY }; setHover(true); }}
      onMouseLeave={() => setHover(false)}
      className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-caption text-muted-foreground"
    >
      {mode === 'blocks' ? 'Over the document' : 'Over a selection'}
      {hover && <TabHint mode={mode} pointer={pointer} />}
    </div>
  );
};

// --- Plan diff --------------------------------------------------------------

const usePlanDiff = () => useMemo(() => computePlanDiff(PLAN_V1, PLAN_V2), []);
const REPO = { display: 'hypermark', branch: 'main' };

const BadgeSlot: React.FC<{ active?: boolean; baseline?: boolean }> = ({ active = false, baseline = false }) => {
  const { stats } = usePlanDiff();
  const [isActive, setActive] = useState(active);
  return (
    <PlanDiffBadge
      stats={stats}
      isActive={isActive}
      onToggle={() => setActive((v) => !v)}
      hasPreviousVersion
      baselineLabel={baseline ? 'v1' : undefined}
      baselineTooltip={baseline ? 'Comparing against version 1, not the latest' : undefined}
    />
  );
};

const LaneSlot: React.FC = () => {
  const { stats } = usePlanDiff();
  const [active, setActive] = useState(false);
  return (
    <div className={`${FRAME} relative h-16`}>
      <StickyHeaderLane
        visibility="always"
        sticky={false}
        repoInfo={REPO}
        planDiffStats={stats}
        isPlanDiffActive={active}
        hasPreviousVersion
        onPlanDiffToggle={() => setActive((v) => !v)}
      />
    </div>
  );
};

const VersionsSlot: React.FC<{ loading?: boolean; base?: number; fetching?: number }> = ({ loading = false, base = 2, fetching = null }) => {
  const [selected, setSelected] = useState(base);
  return (
    <div className={`${FRAME} bg-card`}>
      <VersionBrowser
        versionInfo={VERSION_INFO}
        versions={loading ? [] : VERSIONS}
        selectedBaseVersion={selected}
        onSelectBaseVersion={setSelected}
        isPlanDiffActive
        hasPreviousVersion
        onActivatePlanDiff={say('Shows the diff')}
        isLoading={loading}
        isSelectingVersion={fetching !== null}
        fetchingVersion={fetching}
        onFetchVersions={() => {}}
      />
    </div>
  );
};

const PlanDiffSlot: React.FC = () => {
  const { blocks, stats } = usePlanDiff();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div className={`${FRAME} py-6`}>
      <PlanDiffViewer
        diffBlocks={blocks}
        diffStats={stats}
        onPlanDiffToggle={say('Back to the plan')}
        repoInfo={REPO}
        baseVersionLabel="v1"
        baseVersion={1}
        maxWidth={760}
        annotations={annotations}
        onAddAnnotation={(a) => setAnnotations((prev) => [...prev, a])}
        onSelectAnnotation={setSelectedId}
        selectedAnnotationId={selectedId}
      />
    </div>
  );
};

// --- Side chat --------------------------------------------------------------

const SideChatSlot: React.FC<{ layout: SideChatLayout }> = ({ layout }) => {
  const props = useComposerProps();
  return <SideChatDemo layout={layout} quote={QUOTE} {...props} />;
};

// --- Renderers --------------------------------------------------------------

export const CANVAS_RENDERERS: CanvasRenderers = {
  'composer': {
    'now-quote': () => <NowComposerSlot id="quote" />,
    'now-edit': () => <NowComposerSlot id="edit" initialText="What about large files? Memory could get tight." />,
    'now-global': () => <NowComposerSlot id="global" isGlobal />,
    'fluid': () => <FluidComposerSlot />,
  },
  'panel': {
    'empty': () => <PanelSlot />,
    'cards': () => <PanelSlot annotations={PANEL_ANNOTATIONS} codeAnnotations={PANEL_CODE_ANNOTATIONS} />,
    'selected': () => <PanelSlot annotations={PANEL_ANNOTATIONS} codeAnnotations={PANEL_CODE_ANNOTATIONS} selected="a-comment" />,
    'all': () => <PanelSlot annotations={RAIL_GROUPS[0].annotations} scope="all" />,
    'fluid-tabs': () => <FluidScopeSlot />,
  },
  'rail': {
    'shown': () => <RailSlot messages={RAIL_MESSAGES} selected="m2" showShort />,
    'hidden': () => <RailSlot messages={RAIL_MESSAGES} selected="m2" showShort={false} />,
    'short-open': () => <RailSlot messages={RAIL_MESSAGES} selected="m5" showShort={false} />,
  },
  'send': {
    'all-good': () => <SendSlot gate={false} count={0} />,
    'feedback': () => <SendSlot gate={false} count={3} />,
    'gate': () => <SendSlot gate count={0} />,
    'gate-feedback': () => <SendSlot gate count={3} />,
  },
  'header': {
    'now': () => (
      <div className={FRAME}>
        <AppHeader sticky={false} isApiMode origin="claude-code" isSubmitting={false} isExiting={false} annotateDecision={HEADER_DECISION} />
      </div>
    ),
    'fluid-command': () => (
      <div className={`${FRAME} h-80 max-w-md bg-popover`}>
        <CommandMenu items={COMMANDS} onSelect={(item) => toast(item.label)}>
          <CommandMenuInput placeholder="Search settings and actions…" />
          <CommandMenuList>
            <CommandMenuEmpty>No results.</CommandMenuEmpty>
          </CommandMenuList>
        </CommandMenu>
      </div>
    ),
  },
  'toc': {
    'plain': () => <TocSlot />,
    'active': () => <TocSlot active />,
    'counts': () => <TocSlot active counts />,
  },
  'dialogs': {
    'shortcuts': () => <ShortcutsSlot />,
    'labels': () => <div className="w-fit"><QuickLabelsButton /></div>,
    'confirm': () => <ConfirmSlot />,
    'fluid': () => <FluidDialogSlot />,
  },
  'code': {
    'popout': () => <PopoutSlot />,
    'picker': () => <PickerSlot />,
  },
  'completion': {
    'approved': () => <CompletionSlot kind="approved" />,
    'feedback': () => <CompletionSlot kind="feedback" />,
    'exited': () => <CompletionSlot kind="exited" />,
  },
  'typography': {
    'viewer': () => <ViewerSlot />,
  },
  'tab': {
    'one': () => <TabSlot pick={PICK_ONE} />,
    'several': () => <TabSlot pick={PICK_SEVERAL} />,
    'list-code': () => <TabSlot pick={PICK_LIST_CODE} />,
    'hints': () => (
      <div className="flex flex-col gap-3">
        <HintBox mode="blocks" />
        <HintBox mode="back" />
      </div>
    ),
  },
  'plan-diff': {
    'badge': () => <BadgeSlot />,
    'badge-active': () => <BadgeSlot active />,
    'badge-baseline': () => <BadgeSlot baseline />,
    'lane': () => <LaneSlot />,
    'versions-loading': () => <VersionsSlot loading />,
    'versions': () => <VersionsSlot />,
    'versions-base': () => <VersionsSlot base={1} />,
    'versions-fetching': () => <VersionsSlot base={1} fetching={1} />,
  },
  'plan-diff-view': {
    'rendered': () => <PlanDiffSlot />,
  },
  'side-chat': {
    'card': () => <SideChatSlot layout="card" />,
    'column': () => <SideChatSlot layout="column" />,
    'panel': () => <SideChatSlot layout="panel" />,
    'inline': () => <SideChatSlot layout="inline" />,
  },
};

/** Provides the shared state some groups need. */
export const CanvasState: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const composer = useState<string | null>(null);
  return <OpenComposer.Provider value={composer}>{children}</OpenComposer.Provider>;
};
