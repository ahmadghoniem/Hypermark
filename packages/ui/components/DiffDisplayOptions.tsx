import React from 'react';
import type { DiffLineBgIntensity } from '@hypermark/core/config-types';
import { configStore, useConfigValue } from '../config';

export const DIFF_FONT_OPTIONS = [
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

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={['flex items-center gap-1 bg-muted/50 rounded-lg p-0.5', disabled && 'opacity-50'].filter(Boolean).join(' ')}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          {...(disabled ? { disabled: true } : {})}
          onClick={() => onChange(opt.value)}
          className={[
            'flex-1 px-2.5 py-1 text-xs rounded-md transition-colors',
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

export function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <div>
        <div className="text-xs font-medium">{label}</div>
        {description && <div className="text-[11px] text-muted-foreground">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:cursor-not-allowed"
      >
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full transition-colors ${
            checked ? 'bg-primary' : 'bg-muted'
          }`}
        />
        <span
          aria-hidden="true"
          className={`absolute inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4.5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export const DiffDisplayOptions: React.FC = () => {
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
    <div className="space-y-3.5 text-xs">
      {/* Font Family */}
      <div className="space-y-1.5">
        <div>
          <div className="font-medium">Code Font</div>
          <div className="text-[11px] text-muted-foreground">Font family for diff code lines</div>
        </div>
        <select
          value={diffFontFamily}
          onChange={(e) => configStore.set('diffFontFamily', e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs rounded-md bg-muted/50 border border-border text-foreground"
          style={diffFontFamily ? { fontFamily: `'${diffFontFamily}', monospace` } : undefined}
        >
          {DIFF_FONT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {diffFontFamily && (
          <div
            className="text-[11px] text-muted-foreground px-2 py-1 rounded bg-muted/30 font-mono"
            style={{ fontFamily: `'${diffFontFamily}', monospace` }}
          >
            Preview: const x = fn(42);
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Font Size */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Code Font Size</div>
            <div className="text-[11px] text-muted-foreground">Font size for diff code lines</div>
          </div>
          <div className="text-[11px] tabular-nums text-muted-foreground min-w-[4ch] text-right">
            {diffFontSize || 'Auto'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={8}
            max={24}
            step={1}
            value={diffFontSize ? parseInt(diffFontSize, 10) : 13}
            onChange={(e) => configStore.set('diffFontSize', `${e.target.value}px`)}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
          />
          {diffFontSize && (
            <button
              type="button"
              onClick={() => configStore.set('diffFontSize', '')}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Diff Style */}
      <div className="space-y-1.5">
        <div>
          <div className="font-medium">Diff Style</div>
          <div className="text-[11px] text-muted-foreground">Side-by-side or inline diff view</div>
        </div>
        <SegmentedControl options={DIFF_STYLE_OPTIONS} value={diffStyle} onChange={(v) => configStore.set('diffStyle', v)} />
      </div>

      <div className="border-t border-border" />

      {/* Line Overflow */}
      <div className="space-y-1.5">
        <div>
          <div className="font-medium">Line Overflow</div>
          <div className="text-[11px] text-muted-foreground">How to handle long lines in diffs</div>
        </div>
        <SegmentedControl options={OVERFLOW_OPTIONS} value={diffOverflow} onChange={(v) => configStore.set('diffOverflow', v)} />
      </div>

      <div className="border-t border-border" />

      {/* Change Indicators */}
      <div className="space-y-1.5">
        <div>
          <div className="font-medium">Change Indicators</div>
          <div className="text-[11px] text-muted-foreground">Style of +/- markers in the gutter</div>
        </div>
        <SegmentedControl options={INDICATOR_OPTIONS} value={diffIndicators} onChange={(v) => configStore.set('diffIndicators', v)} />
      </div>

      <div className="border-t border-border" />

      {/* Inline Diff Granularity */}
      <div className="space-y-1.5">
        <div>
          <div className="font-medium">Inline Diff Granularity</div>
          <div className="text-[11px] text-muted-foreground">Highlight granularity for inline changes</div>
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
        <div className="space-y-1.5 pl-3">
          <div>
            <div className="font-medium">Line Background Intensity</div>
            <div className="text-[11px] text-muted-foreground">How prominent the colored line backgrounds appear</div>
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
    </div>
  );
};
