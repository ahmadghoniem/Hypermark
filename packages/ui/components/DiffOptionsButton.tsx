import React from 'react';
import { Popover } from '@base-ui/react/popover';
import type { DiffLineBgIntensity } from '@hypermark/core/config-types';
import { configStore, useConfigValue } from '../config';
import { OptionsIcon } from './icons/headerIcons';

/**
 * Diff display options, opened from the review header's options button.
 *
 * Diff style (split vs unified) is deliberately absent: the header's own icon
 * toggle owns it, and a second control for one setting a few pixels away was
 * the duplication this popover replaced.
 */

const FONT_OPTIONS = [
  { value: '', label: 'Theme default' },
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

const OVERFLOW_OPTIONS = [
  { value: 'scroll' as const, label: 'Scroll' },
  { value: 'wrap' as const, label: 'Wrap' },
];

const INDICATOR_OPTIONS = [
  { value: 'bars' as const, label: 'Bars' },
  { value: 'classic' as const, label: 'Classic' },
  { value: 'none' as const, label: 'None' },
];

const LINE_DIFF_OPTIONS = [
  { value: 'word-alt' as const, label: 'Word-alt' },
  { value: 'word' as const, label: 'Word' },
  { value: 'char' as const, label: 'Char' },
  { value: 'none' as const, label: 'None' },
];

const LINE_BG_INTENSITY_OPTIONS: { value: DiffLineBgIntensity; label: string }[] = [
  { value: 'subtle', label: 'Subtle' },
  { value: 'normal', label: 'Normal' },
  { value: 'strong', label: 'Strong' },
];

function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-px bg-muted/60 rounded-md p-px">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-1 text-[11px] rounded-[5px] transition-colors ${
            value === opt.value
              ? 'bg-background text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ value, min, max, onChange, label }: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="w-full flex items-center justify-between py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-px bg-muted/60 rounded-md p-px">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          className="px-1.5 py-0.5 text-[11px] rounded-[5px] text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label={`Decrease ${label}`}
        >−</button>
        <span className="px-2 text-[11px] tabular-nums w-5 text-center">{value}</span>
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          className="px-1.5 py-0.5 text-[11px] rounded-[5px] text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label={`Increase ${label}`}
        >+</button>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between py-1 group"
    >
      <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
      <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-muted-foreground/25'
      }`}>
        <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-3.5' : 'translate-x-0.5'
        }`} />
      </span>
    </button>
  );
}

export const DiffOptionsButton: React.FC = () => {
  const diffOverflow = useConfigValue('diffOverflow');
  const diffIndicators = useConfigValue('diffIndicators');
  const diffLineDiffType = useConfigValue('diffLineDiffType');
  const diffShowLineNumbers = useConfigValue('diffShowLineNumbers');
  const diffShowBackground = useConfigValue('diffShowBackground');
  const diffLineBgIntensity = useConfigValue('diffLineBgIntensity');
  const diffHideWhitespace = useConfigValue('diffHideWhitespace');
  const diffExpandUnchanged = useConfigValue('diffExpandUnchanged');
  const diffTabSize = useConfigValue('diffTabSize');
  const diffFontFamily = useConfigValue('diffFontFamily');
  const diffFontSize = useConfigValue('diffFontSize');

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            className="flex h-7 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted data-popup-open:text-foreground"
            title="Diff display options"
            aria-label="Diff display options"
          />
        }
      >
        <OptionsIcon className="w-4 h-4" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={6} className="z-50">
          <Popover.Popup className="w-[min(18rem,calc(100vw-1rem))] max-h-[calc(var(--pn-viewport-height,100vh)-2rem-var(--pn-safe-top)-var(--pn-safe-bottom))] overflow-y-auto bg-popover text-popover-foreground border border-border rounded-lg shadow-lg origin-[var(--transform-origin)] transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0">
            <div className="p-2.5 space-y-2">
              <div className="space-y-1.5">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Code font</div>
                  <select
                    value={diffFontFamily}
                    onChange={(e) => configStore.set('diffFontFamily', e.target.value)}
                    className="w-full px-2 py-1 text-[11px] rounded-md bg-muted/60 border border-border text-foreground"
                    style={diffFontFamily ? { fontFamily: `'${diffFontFamily}', monospace` } : undefined}
                    aria-label="Code font"
                  >
                    {FONT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full flex items-center justify-between py-1 gap-2">
                  <span className="text-[11px] text-muted-foreground flex-none">Font size</span>
                  <input
                    type="range"
                    min={8}
                    max={24}
                    step={1}
                    value={diffFontSize ? parseInt(diffFontSize, 10) : 13}
                    onChange={(e) => configStore.set('diffFontSize', `${e.target.value}px`)}
                    className="flex-1 min-w-0 h-1.5 accent-primary cursor-pointer"
                    aria-label="Code font size"
                  />
                  <span className="text-[11px] tabular-nums text-muted-foreground w-[4ch] text-right flex-none">
                    {diffFontSize ? parseInt(diffFontSize, 10) : 'Auto'}
                  </span>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Long lines</div>
                  <Segmented options={OVERFLOW_OPTIONS} value={diffOverflow} onChange={(v) => configStore.set('diffOverflow', v)} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Indicators</div>
                  <Segmented options={INDICATOR_OPTIONS} value={diffIndicators} onChange={(v) => configStore.set('diffIndicators', v)} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Inline diff</div>
                  <Segmented options={LINE_DIFF_OPTIONS} value={diffLineDiffType} onChange={(v) => configStore.set('diffLineDiffType', v)} />
                </div>
              </div>

              <div className="border-t border-border/50" />

              <div>
                <Toggle checked={diffShowLineNumbers} onChange={(v) => configStore.set('diffShowLineNumbers', v)} label="Line numbers" />
                <Toggle checked={diffShowBackground} onChange={(v) => configStore.set('diffShowBackground', v)} label="Diff background" />
                {diffShowBackground && (
                  <div className="pl-3 pr-0.5 pb-1 -mt-0.5">
                    <Segmented options={LINE_BG_INTENSITY_OPTIONS} value={diffLineBgIntensity} onChange={(v) => configStore.set('diffLineBgIntensity', v)} />
                  </div>
                )}
                <Toggle checked={diffExpandUnchanged} onChange={(v) => configStore.set('diffExpandUnchanged', v)} label="Full file context" />
                <Toggle checked={diffHideWhitespace} onChange={(v) => configStore.set('diffHideWhitespace', v)} label="Hide whitespace" />
                <Stepper
                  label="Tab size"
                  value={diffTabSize}
                  min={1}
                  max={8}
                  onChange={(v) => configStore.set('diffTabSize', v)}
                />
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};
