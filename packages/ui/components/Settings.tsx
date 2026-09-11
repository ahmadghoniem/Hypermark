import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { AnnotateAgentTerminalSide } from '@hypermark/core/agent-terminal';
import type { Origin } from '@hypermark/core/agents';
import type { DiffLineBgIntensity } from '@hypermark/core/config-types';
import { configStore, useConfigValue, setReviewPanelView, setReviewDefaultDiffType, setReviewAutoViewed } from '../config';
import { TaterSpritePullup } from './TaterSpritePullup';
import {
  getPlanSaveSettings,
  savePlanSaveSettings,
  type PlanSaveSettings,
} from '../utils/planSave';
import {
  getUIPreferences,
  saveUIPreferences,
  PLAN_WIDTH_OPTIONS,
  type UIPreferences,
  type PlanWidth,
} from '../utils/uiPreferences';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { type QuickLabel, getQuickLabels, saveQuickLabels, resetQuickLabels, DEFAULT_QUICK_LABELS, getLabelColors, LABEL_COLOR_MAP } from '../utils/quickLabels';
import { ThemeTab } from './ThemeTab';
import { modKeyWord, altKey } from '../utils/platform';
import { HooksTab } from './settings/HooksTab';
import { OverlayScrollArea } from './OverlayScrollArea';
import { AnalysisLayerToggle } from './AnalysisLayerToggle';

type SettingsTab = 'general' | 'theme' | 'git' | 'display' | 'analysis' | 'saving' | 'labels' | 'shortcuts' | 'hooks';

interface SettingsProps {
  taterMode: boolean;
  onTaterModeChange: (enabled: boolean) => void;
  origin?: Origin | null;
  mode?: 'plan' | 'annotate' | 'review';
  onUIPreferencesChange?: (prefs: UIPreferences) => void;
  /** Externally controlled open state (for mobile menu integration) */
  externalOpen?: boolean;
  onExternalClose?: () => void;
  /** Current session is a local git review where since-base ISN'T offered
   *  (base ref unresolvable) — the Git tab shows a note that the Git-status
   *  preference can't take effect in THIS repo. */
  sinceBaseUnavailable?: boolean;
  /** The host is rendering its compact touch shell (review only). Display
   *  settings that the compact shell overrides for the session are hidden
   *  there instead of silently editing the desktop preference. */
  isCompactTouchLayout?: boolean;
  /** This annotate session actually offers the Agent TUI, so its Position
   *  setting is worth showing. Default false: the setting is the only way back
   *  from a Hidden position, but offering it where no terminal can ever run
   *  would just be a dead control. */
  agentTerminalAvailable?: boolean;
}

// --- Review-mode Display tab (diff display options) ---

// These resolve against locally installed fonts: the CDN stylesheet injection
// that used to fetch them is gone. A family the machine lacks falls back to the
// generic monospace stack rather than failing. Whether this list should become a
// bundled set, a free-text family name, or a permission-gated local enumeration
// is the open localFontPickerPolicy decision, so it is left as-is for now.
const DIFF_FONT_OPTIONS = [
  { value: '', label: 'Theme Default' },
  { value: 'Fira Code', label: 'Fira Code' },
  { value: 'Hack', label: 'Hack' },
  { value: 'IBM Plex Mono', label: 'IBM Plex Mono' },
  { value: 'Inconsolata', label: 'Inconsolata' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
  { value: 'Red Hat Mono', label: 'Red Hat Mono' },
  { value: 'Roboto Mono', label: 'Roboto Mono' },
  { value: 'Source Code Pro', label: 'Source Code Pro' },
  { value: 'Atkinson Hyperlegible Mono', label: 'Atkinson Hyperlegible' },
];

export const DIFF_STYLE_OPTIONS = [
  { value: 'split' as const, label: 'Split' },
  { value: 'unified' as const, label: 'Unified' },
];
/**
 * The modifier gate is the platform's primary modifier: Cmd on macOS, Ctrl on
 * Windows and Linux. Labeled through modKeyWord so the control names the key
 * the reader actually has.
 */
export const OVERFLOW_OPTIONS = [
  { value: 'scroll' as const, label: 'Scroll' },
  { value: 'wrap' as const, label: 'Wrap' },
];
export const INDICATOR_OPTIONS = [
  { value: 'bars' as const, label: 'Bars' },
  { value: 'classic' as const, label: 'Classic' },
  { value: 'none' as const, label: 'None' },
];
export const LINE_DIFF_OPTIONS = [
  { value: 'word-alt' as const, label: 'Word-Alt' },
  { value: 'word' as const, label: 'Word' },
  { value: 'char' as const, label: 'Char' },
  { value: 'none' as const, label: 'None' },
];
export const LINE_BG_INTENSITY_OPTIONS: { value: DiffLineBgIntensity; label: string }[] = [
  { value: 'subtle', label: 'Subtle' },
  { value: 'normal', label: 'Normal' },
  { value: 'strong', label: 'Strong' },
];
const DEFAULT_DIFF_TYPE_OPTIONS = [
  // "All Changes" belongs to since-base (the flagship composite); uncommitted
  // reverts to its plain name so the two stay distinguishable side by side.
  { value: 'since-base' as const, label: 'All Changes (Recommended)', description: "Everything since your branch split from main — committed, uncommitted, and untracked" },
  { value: 'local-vs-remote' as const, label: 'Local vs Remote Branch', description: "Your local branch and working tree compared with its last-fetched remote-tracking branch" },
  { value: 'uncommitted' as const, label: 'Uncommitted', description: "Everything you've changed since your last commit" },
  { value: 'unstaged' as const, label: 'Unstaged', description: "Only changes you haven't staged yet" },
  { value: 'staged' as const, label: 'Staged', description: "Only changes you've staged for commit" },
  { value: 'merge-base' as const, label: 'Committed changes (PR view)', description: "Everything you've committed on this branch" },
  { value: 'all' as const, label: 'All Files (HEAD)', description: "Every tracked file at HEAD, shown as additions" },
];

const AGENT_TERMINAL_SIDE_OPTIONS: { value: AnnotateAgentTerminalSide; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'hidden', label: 'Hidden' },
];

function SegmentedControl<T extends string>({ options, value, onChange, disabled = false }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Visible but inert, for a control whose axis does not apply right now. */
  disabled?: boolean;
}) {
  return (
    <div className={['flex items-center gap-1 bg-muted/50 rounded-lg p-0.5', disabled && 'opacity-50'].filter(Boolean).join(' ')}>
      {options.map((opt) => (
        <button
          key={opt.value}
          {...(disabled ? { disabled: true } : {})}
          onClick={() => onChange(opt.value)}
          className={[
            'flex-1 px-3 py-1.5 text-xs rounded-md transition-colors',
            disabled && 'cursor-not-allowed',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground',
          ].filter(Boolean).join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, label, description, disabled = false }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-11 w-11 shrink-0 items-center disabled:cursor-not-allowed"
      >
        <span
          aria-hidden="true"
          className={`absolute inset-x-0 top-2.5 h-6 rounded-full transition-colors ${
            checked ? 'bg-primary' : 'bg-muted'
          }`}
        />
        <span
          aria-hidden="true"
          className={`absolute top-3.5 inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}


function ReviewAnalysisTab() {
  const semanticDiffEnabled = useConfigValue('semanticDiffEnabled');
  const callFlowEnabled = useConfigValue('callFlowEnabled');
  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-semibold">Analysis layers</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Add structural context to the ordinary code diff. Each layer is independent and does no work while disabled.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
        <AnalysisLayerToggle
          checked={semanticDiffEnabled}
          onChange={(enabled) => configStore.set('semanticDiffEnabled', enabled)}
          label="Semantic changes"
          description="Organize added, changed, moved, and removed functions, classes, and other named code. Enabled by default."
        />
        <div className="border-t border-border" />
        <AnalysisLayerToggle
          checked={callFlowEnabled}
          onChange={(enabled) => configStore.set('callFlowEnabled', enabled)}
          label="Call flow"
          description="Diffs for function call stacks across git commits. 22 languages supported (AST-based, built using Tree-sitter)."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 font-mono text-primary">▣</span>
            Dock
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Open the complete analysis from the file panel. Rows jump to the relevant code location.
          </p>
        </div>
        <div className="rounded-xl border border-border p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 font-mono text-primary">⌁</span>
            File lens
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            File headers show compact counts and a focused popover for that file.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-warning/25 bg-warning/[0.05] p-4 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Call flow is syntactic.</span>{' '}
        It does not use type resolution or runtime traces, so treat it as navigation context—not proof that a path executes.
      </div>
    </div>
  );
}

const GitTab: React.FC<{ sinceBaseUnavailable?: boolean }> = ({ sinceBaseUnavailable }) => {
  const defaultDiffType = useConfigValue('defaultDiffType');
  const reviewPanelView = useConfigValue('reviewPanelView');
  const reviewAutoViewed = useConfigValue('reviewAutoViewed');
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Viewed files
        </div>
        {/* Never write `reviewAutoViewed` directly — setReviewAutoViewed also
            consumes the first-time notice, since an explicit toggle is proof
            the reviewer already found the switch. */}
        <ToggleSwitch
          checked={reviewAutoViewed}
          onChange={(v) => setReviewAutoViewed(v)}
          label="Auto-mark viewed"
          description="Mark a file viewed when you scroll past it or move on to another file. Files you un-view stay un-viewed, and files that change on refresh become un-viewed."
        />
      </div>
      <div className="space-y-2">
        <div>
          <div className="text-sm font-medium">Default review view</div>
          <div className="text-xs text-muted-foreground">Which panel a code review opens in</div>
          {/* This is a GLOBAL preference — never hide the options because the
              CURRENT repo can't serve them; just say so. Without this note,
              picking Git status on a repo whose base ref doesn't resolve
              silently falls back to Tree and the setting looks broken. */}
          {sinceBaseUnavailable && (
            <div className="text-xs text-warning mt-1">
              Git status view isn't available in this repository (its base branch
              couldn't be resolved) — reviews here open in Tree. The preference
              still applies in repositories where it works.
            </div>
          )}
        </div>
        {/* No Commits option here: the Commits view is session-only (entered
            via the panel toggle) and is never the opening view. */}
        <SegmentedControl
          options={[
            { value: 'sections' as const, label: 'Git status' },
            { value: 'tree' as const, label: 'Tree' },
          ]}
          value={reviewPanelView}
          onChange={setReviewPanelView}
        />
      </div>
      <div className="space-y-2">
      <div>
        <div className="text-sm font-medium">Default Diff View</div>
        <div className="text-xs text-muted-foreground">Which changes to show when you open a code review</div>
      </div>
      <div className="space-y-2">
        {DEFAULT_DIFF_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            // Coupling (sections ⟺ since-base) lives in the shared setter —
            // never write the pair by hand (see config/reviewView).
            onClick={() => setReviewDefaultDiffType(opt.value)}
            className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors text-left ${
              defaultDiffType === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
            }`}
          >
            <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
              defaultDiffType === opt.value ? 'border-primary' : 'border-muted-foreground/40'
            }`}>
              {defaultDiffType === opt.value && (
                <div className="w-2 h-2 rounded-full bg-primary" />
              )}
            </div>
            <div>
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-xs text-muted-foreground">{opt.description}</div>
            </div>
          </button>
        ))}
      </div>
      </div>
    </div>
  );
};

const ReviewDisplayTab: React.FC<{ isCompactTouchLayout?: boolean }> = ({ isCompactTouchLayout = false }) => {
  const diffStyle = useConfigValue('diffStyle');
  const diffOverflow = useConfigValue('diffOverflow');
  const diffIndicators = useConfigValue('diffIndicators');
  const diffLineDiffType = useConfigValue('diffLineDiffType');
  const diffShowLineNumbers = useConfigValue('diffShowLineNumbers');
  const diffShowBackground = useConfigValue('diffShowBackground');
  const diffLineBgIntensity = useConfigValue('diffLineBgIntensity');
  const diffHideWhitespace = useConfigValue('diffHideWhitespace');
  const diffExpandUnchanged = useConfigValue('diffExpandUnchanged');
  const diffFontFamily = useConfigValue('diffFontFamily');
  const diffFontSize = useConfigValue('diffFontSize');
  return (
    <>
      {/* Font Family */}
      <div className="space-y-2">
        <div>
          <div className="text-sm font-medium">Code Font</div>
          <div className="text-xs text-muted-foreground">Font family for diff code lines</div>
        </div>
        <select
          value={diffFontFamily}
          onChange={(e) => configStore.set('diffFontFamily', e.target.value)}
          className="w-full max-w-[16rem] px-3 py-1.5 text-sm rounded-md bg-muted/50 border border-border text-foreground"
          style={diffFontFamily ? { fontFamily: `'${diffFontFamily}', monospace` } : undefined}
        >
          {DIFF_FONT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {diffFontFamily && (
          <div
            className="text-xs text-muted-foreground px-1 py-1 rounded bg-muted/30 font-mono"
            style={{ fontFamily: `'${diffFontFamily}', monospace` }}
          >
            Preview: const x = fn(42);
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Font Size */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Code Font Size</div>
            <div className="text-xs text-muted-foreground">Font size for diff code lines</div>
          </div>
          <div className="text-xs tabular-nums text-muted-foreground min-w-[4ch] text-right">
            {diffFontSize || 'Auto'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={8}
            max={24}
            step={1}
            value={diffFontSize ? parseInt(diffFontSize) : 13}
            onChange={(e) => configStore.set('diffFontSize', `${e.target.value}px`)}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
          />
          {diffFontSize && (
            <button
              onClick={() => configStore.set('diffFontSize', '')}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Diff Style. The compact touch shell renders a session-only unified
          diff, so the control there would look dead while quietly rewriting
          the DESKTOP preference. Say what the phone is doing instead. */}
      <div className="space-y-2">
        <div>
          <div className="text-sm font-medium">Diff Style</div>
          <div className="text-xs text-muted-foreground">Side-by-side or inline diff view</div>
          {isCompactTouchLayout && (
            <div className="text-xs text-muted-foreground mt-1">
              This layout shows unified diffs for the session; your desktop
              preference is unchanged.
            </div>
          )}
        </div>
        {!isCompactTouchLayout && (
          <SegmentedControl options={DIFF_STYLE_OPTIONS} value={diffStyle} onChange={(v) => configStore.set('diffStyle', v)} />
        )}
      </div>

      <div className="border-t border-border" />

      {/* Line Overflow */}
      <div className="space-y-2">
        <div>
          <div className="text-sm font-medium">Line Overflow</div>
          <div className="text-xs text-muted-foreground">How to handle long lines in diffs</div>
        </div>
        <SegmentedControl options={OVERFLOW_OPTIONS} value={diffOverflow} onChange={(v) => configStore.set('diffOverflow', v)} />
      </div>

      <div className="border-t border-border" />

      {/* Change Indicators */}
      <div className="space-y-2">
        <div>
          <div className="text-sm font-medium">Change Indicators</div>
          <div className="text-xs text-muted-foreground">Style of +/- markers in the gutter</div>
        </div>
        <SegmentedControl options={INDICATOR_OPTIONS} value={diffIndicators} onChange={(v) => configStore.set('diffIndicators', v)} />
      </div>

      <div className="border-t border-border" />

      {/* Inline Diff Granularity */}
      <div className="space-y-2">
        <div>
          <div className="text-sm font-medium">Inline Diff Granularity</div>
          <div className="text-xs text-muted-foreground">Highlight granularity for inline changes</div>
        </div>
        <SegmentedControl options={LINE_DIFF_OPTIONS} value={diffLineDiffType} onChange={(v) => configStore.set('diffLineDiffType', v)} />
      </div>

      <div className="border-t border-border" />

      {/* Show Line Numbers */}
      <ToggleSwitch
        checked={diffShowLineNumbers}
        onChange={(v) => configStore.set('diffShowLineNumbers', v)}
        label="Show Line Numbers"
      />

      <div className="border-t border-border" />

      {/* Show Diff Background */}
      <ToggleSwitch
        checked={diffShowBackground}
        onChange={(v) => configStore.set('diffShowBackground', v)}
        label="Show Diff Background"
        description="Colored backgrounds on added/deleted lines"
      />

      {/* Line Background Intensity */}
      {diffShowBackground && (
        <div className="space-y-2 pl-4">
          <div>
            <div className="text-sm font-medium">Line Background Intensity</div>
            <div className="text-xs text-muted-foreground">How prominent the colored line backgrounds appear</div>
          </div>
          <SegmentedControl options={LINE_BG_INTENSITY_OPTIONS} value={diffLineBgIntensity} onChange={(v) => configStore.set('diffLineBgIntensity', v)} />
        </div>
      )}

      <div className="border-t border-border" />

      {/* Expand Unchanged Regions */}
      <ToggleSwitch
        checked={diffExpandUnchanged}
        onChange={(v) => configStore.set('diffExpandUnchanged', v)}
        label="Expand Unchanged Regions"
        description="Show full file content around changes by default"
      />

      <div className="border-t border-border" />

      {/* Hide Whitespace */}
      <ToggleSwitch
        checked={diffHideWhitespace}
        onChange={(v) => configStore.set('diffHideWhitespace', v)}
        label="Hide Whitespace"
        description="Ignore whitespace-only changes in diffs"
      />

      <div className="border-t border-border" />


    </>
  );
};


export const Settings: React.FC<SettingsProps> = ({ taterMode, onTaterModeChange, origin, mode = 'plan', onUIPreferencesChange, externalOpen, onExternalClose, sinceBaseUnavailable, isCompactTouchLayout = false, agentTerminalAvailable = false }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [themePreview, setThemePreview] = useState(false);

  useEffect(() => {
    if (!themePreview) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setThemePreview(false); setShowDialog(true); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [themePreview]);
  const [activeTab, setActiveTab] = useState<SettingsTab>('theme');
  const agentTerminalSide = useConfigValue('agentTerminalSide');
  const [planSave, setPlanSave] = useState<PlanSaveSettings>({ enabled: true, customPath: null });
  const [uiPrefs, setUiPrefs] = useState<UIPreferences>({ tocEnabled: true, stickyActionsEnabled: true, planWidth: 'compact' });
  const [quickLabelsState, setQuickLabelsState] = useState<QuickLabel[]>([]);
  const [editingTipIndex, setEditingTipIndex] = useState<number | null>(null);
  const [editingTipValue, setEditingTipValue] = useState('');

  // General holds one situational control and nothing else, so in review —
  // and in an annotate session with no agent terminal — the tab opened on a
  // blank pane. It now appears only when it has something in it.
  const hasGeneralSettings = mode === 'annotate' && agentTerminalAvailable;

  const mainTabs = useMemo(() => {
    const t: { id: SettingsTab; label: string }[] = [];
    if (hasGeneralSettings) t.push({ id: 'general', label: 'General' });
    t.push({ id: 'theme', label: 'Theme' });
    if (mode === 'plan') {
      t.push({ id: 'display', label: 'Display' });
      t.push({ id: 'saving', label: 'Saving' });
      t.push({ id: 'labels', label: 'Labels' });
    }
    if (mode === 'review') {
      t.push({ id: 'git', label: 'Git' });
      t.push({ id: 'display', label: 'Editor' });
      t.push({ id: 'analysis', label: 'Analysis' });
    }
    t.push({ id: 'shortcuts', label: 'Shortcuts' });
    if (mode === 'plan') {
      t.push({ id: 'hooks', label: 'Hooks' });
    }
    return t;
  }, [mode, hasGeneralSettings]);

  // A tab can stop existing mid-session (an agent terminal that never became
  // available, a mode switch), which would otherwise leave the dialog showing
  // a pane no tab is highlighting.
  useEffect(() => {
    if (mainTabs.some((tab) => tab.id === activeTab)) return;
    const first = mainTabs[0];
    if (first) setActiveTab(first.id);
  }, [mainTabs, activeTab]);

  // Sync external open state
  useEffect(() => {
    if (externalOpen) {
      setShowDialog(true);
      onExternalClose?.();
    }
  }, [externalOpen, onExternalClose]);

  useEffect(() => {
    if (showDialog) {
      setPlanSave(getPlanSaveSettings());
      setUiPrefs(getUIPreferences());
      setQuickLabelsState(getQuickLabels());
    }
  }, [showDialog]);


  const handlePlanSaveChange = (updates: Partial<PlanSaveSettings>) => {
    const newSettings = { ...planSave, ...updates };
    setPlanSave(newSettings);
    savePlanSaveSettings(newSettings);
  };

  const handleUIPrefsChange = (updates: Partial<UIPreferences>) => {
    const newPrefs = { ...uiPrefs, ...updates };
    setUiPrefs(newPrefs);
    saveUIPreferences(newPrefs);
    onUIPreferencesChange?.(newPrefs);
  };

  // Server write-back is handled automatically by configStore.set() (debounced POST /api/config)

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Settings"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {showDialog && !themePreview && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setShowDialog(false)}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hypermark-settings-title"
            onClick={e => e.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || event.defaultPrevented) return;
              event.preventDefault();
              event.stopPropagation();
              setShowDialog(false);
            }}
          >
            {taterMode && <TaterSpritePullup />}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 id="hypermark-settings-title" className="font-semibold text-sm">Settings</h3>
              <button
                type="button"
                aria-label="Close settings"
                onClick={() => setShowDialog(false)}
                className="p-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col md:flex-row md:min-h-[420px] flex-1 min-h-0 overflow-hidden">
              {/* Mobile: horizontal tab bar */}
              <nav className="md:hidden flex overflow-x-auto border-b border-border px-2 py-1.5 gap-1 flex-shrink-0">
                {mainTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded text-xs whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                      activeTab === tab.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              {/* Desktop: sidebar */}
              <nav className="hidden md:block w-40 border-r border-border p-2 flex-shrink-0">
                <div className="space-y-0.5">
                  {mainTabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors flex items-center justify-between ${
                        activeTab === tab.id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </nav>

              {/* Content — scrollable */}
              <OverlayScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-4">

                {/* === GENERAL TAB === */}
                {activeTab === 'general' && (
                  <>
                    {/* Agent TUI position. The same control lives in the
                        terminal's own Display popover, but that one is
                        unreachable once the position is Hidden — this is the
                        way back. Both write the same config value. Gated on the
                        terminal actually being available in this session, so a
                        remote or runtime-less annotate never offers a dead
                        control. */}
                    {mode === 'annotate' && agentTerminalAvailable && (
                      <>
                        <div className="border-t border-border" />
                        <div className="space-y-2">
                          <div>
                            <div className="text-sm font-medium">Agent TUI Position</div>
                            <div className="text-xs text-muted-foreground">
                              Which side the agent terminal docks on, or Hidden to keep it out of the layout
                            </div>
                          </div>
                          <SegmentedControl
                            options={AGENT_TERMINAL_SIDE_OPTIONS}
                            value={agentTerminalSide}
                            onChange={(v) => configStore.set('agentTerminalSide', v)}
                          />
                          {agentTerminalSide === 'hidden' && (
                            <div className="text-[10px] text-muted-foreground/70">
                              You can still open it for this session from the sidebar rail.
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* === THEME TAB === */}
                {activeTab === 'theme' && <ThemeTab onPreview={() => { setShowDialog(false); setThemePreview(true); }} />}

                {/* === GIT TAB === */}
                {activeTab === 'git' && mode === 'review' && (
                  <GitTab sinceBaseUnavailable={sinceBaseUnavailable} />
                )}

                {/* === DISPLAY TAB === */}
                {activeTab === 'display' && mode === 'review' && (
                  <ReviewDisplayTab isCompactTouchLayout={isCompactTouchLayout} />
                )}

                {activeTab === 'analysis' && mode === 'review' && (
                  <ReviewAnalysisTab />
                )}

                {activeTab === 'display' && mode !== 'review' && (
                  <>
                    {/* Auto-open Sidebar */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">Auto-open Sidebar</div>
                        <div className="text-xs text-muted-foreground">
                          Open sidebar with Table of Contents on load
                        </div>
                      </div>
                      <button
                        role="switch"
                        aria-checked={uiPrefs.tocEnabled}
                        onClick={() => handleUIPrefsChange({ tocEnabled: !uiPrefs.tocEnabled })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          uiPrefs.tocEnabled ? 'bg-primary' : 'bg-muted'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                            uiPrefs.tocEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="border-t border-border" />

                    {/* Sticky Actions */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">Sticky Actions</div>
                        <div className="text-xs text-muted-foreground">
                          Keep action buttons visible while scrolling
                        </div>
                      </div>
                      <button
                        role="switch"
                        aria-checked={uiPrefs.stickyActionsEnabled}
                        onClick={() => handleUIPrefsChange({ stickyActionsEnabled: !uiPrefs.stickyActionsEnabled })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          uiPrefs.stickyActionsEnabled ? 'bg-primary' : 'bg-muted'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                            uiPrefs.stickyActionsEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="border-t border-border" />

                    {/* Plan Width */}
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-medium flex items-center gap-2">Plan Width</div>
                        <div className="text-xs text-muted-foreground">
                          Maximum width of the plan card
                        </div>
                      </div>
                      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                        {PLAN_WIDTH_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => handleUIPrefsChange({ planWidth: opt.id })}
                            className={`flex-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
                              uiPrefs.planWidth === opt.id
                                ? 'bg-background text-foreground shadow-sm font-medium'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* Abstract layout preview — exaggerated proportions for visual clarity */}
                      {(() => {
                        const active = PLAN_WIDTH_OPTIONS.find(o => o.id === uiPrefs.planWidth) ?? PLAN_WIDTH_OPTIONS[0];
                        // Exaggerated proportions so the width difference is visually obvious in the small preview
                        const sidebarPct = 14;
                        const panelPct = 14;
                        const cardPctMap: Record<PlanWidth, number> = { compact: 48, default: 70, wide: 94 };
                        const cardPct = cardPctMap[active.id];
                        return (
                          <div className="space-y-2">
                            <div className="rounded-lg border border-border/40 bg-muted/20 px-2 py-3 overflow-hidden">
                              {/* Simulated header bar */}
                              <div className="flex items-center justify-between mb-2 px-1">
                                <div className="h-0.5 w-8 rounded-full bg-foreground/15" />
                                <div className="flex gap-1">
                                  <div className="h-1 w-1 rounded-full bg-foreground/15" />
                                  <div className="h-1 w-1 rounded-full bg-foreground/15" />
                                  <div className="h-1 w-1 rounded-full bg-foreground/15" />
                                </div>
                              </div>
                              <div className="border-t border-foreground/5 mb-2" />
                              {/* Three-column layout */}
                              <div className="flex gap-1 items-stretch" style={{ minHeight: 64 }}>
                                {/* Sidebar */}
                                <div className="flex-shrink-0 space-y-1 pt-0.5 opacity-30" style={{ width: `${sidebarPct}%` }}>
                                  <div className="h-0.5 w-full rounded-full bg-foreground" />
                                  <div className="h-0.5 w-3/4 rounded-full bg-foreground" />
                                  <div className="h-0.5 w-1/2 rounded-full bg-foreground" />
                                  <div className="h-0.5 w-2/3 rounded-full bg-foreground" />
                                  <div className="h-0.5 w-1/2 rounded-full bg-foreground" />
                                </div>
                                {/* Plan card — width animates */}
                                <div className="flex-1 flex justify-center min-w-0">
                                  <div
                                    className="rounded border border-border/60 bg-card/50 p-1.5 space-y-1 transition-all duration-300 ease-out"
                                    style={{ width: `${cardPct}%`, minWidth: 0 }}
                                  >
                                    {/* Heading */}
                                    <div className="h-1 w-2/5 rounded-full bg-foreground/25" />
                                    {/* Prose lines */}
                                    <div className="space-y-[2px]">
                                      <div className="h-[2px] w-full rounded-full bg-foreground/10" />
                                      <div className="h-[2px] w-11/12 rounded-full bg-foreground/10" />
                                      <div className="h-[2px] w-4/5 rounded-full bg-foreground/10" />
                                    </div>
                                    {/* Code block */}
                                    <div className="rounded bg-muted/60 p-1 space-y-[2px]">
                                      <div className="h-[2px] w-full rounded-full bg-primary/20" />
                                      <div className="h-[2px] w-3/4 rounded-full bg-primary/20" />
                                      <div className="h-[2px] w-5/6 rounded-full bg-primary/20" />
                                    </div>
                                    {/* More prose */}
                                    <div className="space-y-[2px]">
                                      <div className="h-[2px] w-full rounded-full bg-foreground/10" />
                                      <div className="h-[2px] w-3/4 rounded-full bg-foreground/10" />
                                    </div>
                                  </div>
                                </div>
                                {/* Annotation panel */}
                                <div className="flex-shrink-0 space-y-1 pt-0.5 opacity-20" style={{ width: `${panelPct}%` }}>
                                  <div className="rounded border border-foreground/20 p-0.5 space-y-[2px]">
                                    <div className="h-[2px] w-full rounded-full bg-foreground" />
                                    <div className="h-[2px] w-2/3 rounded-full bg-foreground" />
                                  </div>
                                  <div className="rounded border border-foreground/20 p-0.5 space-y-[2px]">
                                    <div className="h-[2px] w-full rounded-full bg-foreground" />
                                    <div className="h-[2px] w-1/2 rounded-full bg-foreground" />
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="text-[10px] text-muted-foreground/70 leading-snug">
                              {active.px}px — {active.hint}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="border-t border-border" />

                    {/* Tater Mode */}
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Tater Mode</div>
                      <button
                        role="switch"
                        aria-checked={taterMode}
                        onClick={() => onTaterModeChange(!taterMode)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          taterMode ? 'bg-primary' : 'bg-muted'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                            taterMode ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </>
                )}

                {/* === SAVING TAB === */}
                {activeTab === 'saving' && (
                  <>
                    {/* Plan Saving */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">Save Plans</div>
                          <div className="text-xs text-muted-foreground">
                            Auto-save plans to the default data directory
                          </div>
                        </div>
                        <button
                          role="switch"
                          aria-checked={planSave.enabled}
                          onClick={() => handlePlanSaveChange({ enabled: !planSave.enabled })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            planSave.enabled ? 'bg-primary' : 'bg-muted'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                              planSave.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      {planSave.enabled && (
                        <div className="space-y-1.5 pl-0.5">
                          <label className="text-xs text-muted-foreground">Custom Path (optional)</label>
                          <input
                            type="text"
                            value={planSave.customPath || ''}
                            onChange={(e) => handlePlanSaveChange({ customPath: e.target.value || null })}
                            placeholder="Leave empty for default"
                            className="w-full px-3 py-2 bg-muted rounded-lg text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                          <div className="text-[10px] text-muted-foreground/70">
                            Leave empty to use default location
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* === LABELS TAB === */}
                {activeTab === 'labels' && (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium flex items-center gap-2">Quick Labels</div>
                        <div className="text-xs text-muted-foreground">
                          Preset annotations for one-click feedback
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          resetQuickLabels();
                          setQuickLabelsState(DEFAULT_QUICK_LABELS);
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Reset to defaults
                      </button>
                    </div>

                    <style>{`
                      @keyframes tip-slide-open {
                        from { opacity: 0; transform: translateY(-4px); }
                        to   { opacity: 1; transform: translateY(0); }
                      }
                    `}</style>
                    <div className="space-y-1.5">
                      {quickLabelsState.map((label, index) => {
                        const colors = getLabelColors(label.color);
                        const hasTip = !!label.tip;
                        const isEditingTip = editingTipIndex === index;
                        return (
                          <div key={index} className="rounded-lg overflow-hidden" style={{ backgroundColor: colors.bg }}>
                            {/* Main row */}
                            <div className="flex items-center gap-2 p-2">
                              <span className="text-sm flex-shrink-0">{label.emoji}</span>
                              <input
                                type="text"
                                value={label.text}
                                onChange={(e) => {
                                  const updated = [...quickLabelsState];
                                  updated[index] = {
                                    ...label,
                                    text: e.target.value,
                                    id: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                                  };
                                  setQuickLabelsState(updated);
                                  saveQuickLabels(updated);
                                }}
                                className="flex-1 px-2 py-1 bg-background/80 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                              />
                              {/* Tip indicator button */}
                              <button
                                onClick={() => {
                                  if (isEditingTip) {
                                    setEditingTipIndex(null);
                                  } else {
                                    setEditingTipIndex(index);
                                    setEditingTipValue(label.tip || '');
                                  }
                                }}
                                className={`relative p-1 rounded transition-all flex-shrink-0 ${
                                  hasTip
                                    ? 'bg-foreground/10 text-foreground/70 hover:text-foreground border border-foreground/15'
                                    : 'text-muted-foreground/30 hover:text-muted-foreground/60 border border-dashed border-muted-foreground/20 hover:border-muted-foreground/40'
                                }`}
                                title={hasTip ? `Tip: ${label.tip}` : 'Add AI instruction tip'}
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                                {hasTip && (
                                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-foreground/50" />
                                )}
                              </button>
                              <select
                                value={label.color}
                                onChange={(e) => {
                                  const updated = [...quickLabelsState];
                                  updated[index] = { ...label, color: e.target.value };
                                  setQuickLabelsState(updated);
                                  saveQuickLabels(updated);
                                }}
                                className="px-1.5 py-1 bg-background/80 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                              >
                                {Object.keys(LABEL_COLOR_MAP).map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                              <span className="text-[10px] text-muted-foreground/50 font-mono w-8 text-center flex-shrink-0">
                                {index < 10 ? `${altKey}+${index === 9 ? '0' : index + 1}` : ''}
                              </span>
                              <button
                                onClick={() => {
                                  const updated = quickLabelsState.filter((_, i) => i !== index);
                                  setQuickLabelsState(updated);
                                  saveQuickLabels(updated);
                                  if (editingTipIndex === index) setEditingTipIndex(null);
                                }}
                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                                title="Remove label"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            {/* Tip editor — slides open below the row */}
                            {isEditingTip && (
                              <div
                                className="flex items-center gap-1.5 px-2 pb-2 pt-0"
                                style={{ animation: 'tip-slide-open 0.15s ease-out' }}
                              >
                                <svg className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 ml-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                                <input
                                  type="text"
                                  value={editingTipValue}
                                  onChange={(e) => setEditingTipValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const updated = [...quickLabelsState];
                                      updated[index] = { ...label, tip: editingTipValue || undefined };
                                      setQuickLabelsState(updated);
                                      saveQuickLabels(updated);
                                      setEditingTipIndex(null);
                                    }
                                    if (e.key === 'Escape') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setEditingTipIndex(null);
                                    }
                                  }}
                                  placeholder="AI instruction tip..."
                                  className="flex-1 px-2 py-1 bg-background/60 rounded text-[10px] text-muted-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/50"
                                  autoFocus
                                  onFocus={(e) => { e.target.setSelectionRange(0, 0); e.target.scrollLeft = 0; }}
                                />
                                <button
                                  onClick={() => {
                                    const updated = [...quickLabelsState];
                                    updated[index] = { ...label, tip: editingTipValue || undefined };
                                    setQuickLabelsState(updated);
                                    saveQuickLabels(updated);
                                    setEditingTipIndex(null);
                                  }}
                                  className="p-1 rounded text-muted-foreground/50 hover:text-green-500 hover:bg-green-500/10 transition-colors flex-shrink-0"
                                  title="Save tip"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {quickLabelsState.length < 12 && (
                      <button
                        onClick={() => {
                          const newLabel: QuickLabel = {
                            id: `custom-${Date.now()}`,
                            emoji: '📌',
                            text: 'New label',
                            color: 'blue',
                          };
                          const updated = [...quickLabelsState, newLabel];
                          setQuickLabelsState(updated);
                          saveQuickLabels(updated);
                        }}
                        className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg hover:border-foreground/30 transition-colors"
                      >
                        + Add label
                      </button>
                    )}

                    <div className="text-[10px] text-muted-foreground/70">
                      Use {altKey}+1 through {altKey}+0 when the annotation toolbar is visible to apply a label instantly.
                    </div>
                  </>
                )}

                {/* === SHORTCUTS TAB === */}
                {activeTab === 'shortcuts' && (
                  <KeyboardShortcuts mode={mode} />
                )}

                {/* === COMMENTS TAB === */}

                {/* === HOOKS TAB === */}
                {activeTab === 'hooks' && <HooksTab />}

              </div>
              </OverlayScrollArea>
            </div>
          </div>
        </div>,
        document.body
      )}

      {themePreview && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col pointer-events-none">
          <div className="flex-1" />
          <div
            className="pointer-events-auto w-full bg-card border-t-2 border-primary/30 shadow-[0_-4px_20px_rgba(0,0,0,0.4)] flex flex-col max-h-[35vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0">
              <span className="text-xs font-medium text-muted-foreground">Theme Preview</span>
              <button
                onClick={() => { setThemePreview(false); setShowDialog(true); }}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
            <div className="p-3 overflow-y-auto flex-1 min-h-0">
              <ThemeTab compact />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
