import React, { useRef, useState } from 'react';
import { Copy01 as Copy, Download01 as Download, File06 as FileText, Keyboard01 as Keyboard, Link01 as Link, Moon01 as Moon, Settings01 as Settings, Tag01 as Tag } from '@untitledui/icons';
import { Copy01, Download01, Link01 } from '@untitledui/icons';
import { toast, Toaster } from 'sonner';

import { Button as NowButton } from '@/ui/components/ui/button';
import { Tooltip as NowTooltip, TooltipProvider } from '@/ui/components/Tooltip';
import { ThemeProvider } from '@/ui/components/ThemeProvider';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { ActionMenu, ActionMenuDivider, ActionMenuItem } from '@/ui/components/ActionMenu';
import { CommentPopover } from '@/ui/components/CommentPopover';
import { DEFAULT_QUICK_LABELS, type QuickLabel } from '@/ui/utils/quickLabels';

import { Button } from '@/ui/fluid/components/button';
import { Tooltip } from '@/ui/fluid/components/tooltip';
import { TabsSubtle, TabsSubtleItem } from '@/ui/fluid/components/tabs-subtle';
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownSeparator } from '@/ui/fluid/components/dropdown';
import { MenuItem } from '@/ui/fluid/components/menu-item';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose,
} from '@/ui/fluid/components/dialog';
import { Switch } from '@/ui/fluid/components/switch';
import { CheckboxGroup, CheckboxItem } from '@/ui/fluid/components/checkbox-group';
import { Badge, type BadgeColor } from '@/ui/fluid/components/badge';
import {
  CommandMenu, CommandMenuInput, CommandMenuList, CommandMenuEmpty, type CommandMenuItemData,
} from '@/ui/fluid/components/command-menu';
import { InputMessage } from '@/ui/fluid/components/input-message';

import { NewComposer } from './NewComposer';

const QUOTE = 'The session is still open and the link text runs into someCode() then wraps onto the next line';

const Row: React.FC<{ id: string; title: string; note: React.ReactNode; now: React.ReactNode; fluid: React.ReactNode; tall?: boolean }> = ({ id, title, note, now, fluid, tall }) => (
  <section id={id} className="border-t border-border py-6">
    <div className="mb-4 flex items-baseline gap-3">
      <h2 className="text-body font-semibold text-foreground">{title}</h2>
      <p className="text-caption text-muted-foreground">{note}</p>
    </div>
    <div className={`grid grid-cols-2 gap-6 ${tall ? 'min-h-110' : ''}`}>
      <div className="rounded-lg border border-dashed border-border p-5">
        <div className="mb-3 text-micro font-semibold uppercase tracking-wider text-muted-foreground">Now</div>
        <div className="flex flex-wrap items-start gap-3">{now}</div>
      </div>
      <div className="rounded-lg border border-dashed border-border p-5">
        <div className="mb-3 text-micro font-semibold uppercase tracking-wider text-muted-foreground">Fluid</div>
        <div className="flex flex-wrap items-start gap-3">{fluid}</div>
      </div>
    </div>
  </section>
);

/** The All/Current toggle as AnnotationPanel draws it. */
const NowScopeToggle: React.FC = () => {
  const [scope, setScope] = useState<'this' | 'all'>('this');
  const tab = (value: 'this' | 'all', label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={scope === value}
      onClick={() => setScope(value)}
      className={`rounded-sm px-1.5 py-0.5 font-semibold transition-all ${scope === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {label}
    </button>
  );
  return (
    <div role="tablist" className="inline-flex items-center rounded-md bg-muted/60 p-0.5 text-micro">
      {tab('this', 'Current')}
      {tab('all', 'All')}
    </div>
  );
};

/** The switch as DiffOptionsButton draws it. */
const NowSwitch: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="group flex w-56 items-center justify-between py-1">
    <span className="text-micro text-muted-foreground transition-colors group-hover:text-foreground">{label}</span>
    <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/25'}`}>
      <span className={`inline-block size-3 rounded-full shadow-sm transition-transform ${checked ? 'translate-x-3.5 bg-primary-foreground' : 'translate-x-0.5 bg-background dark:bg-foreground'}`} />
    </span>
  </button>
);

const LABEL_COLORS: BadgeColor[] = ['green', 'amber', 'orange', 'cyan', 'red', 'blue'];

const COMMANDS: CommandMenuItemData[] = [
  { value: 'theme', label: 'Toggle light / dark', icon: Moon, group: 'View' },
  { value: 'labels', label: 'Edit quick labels', icon: Tag, group: 'Settings' },
  { value: 'diff', label: 'Diff options', icon: Settings, group: 'Settings' },
  { value: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard, shortcut: 'shift+?', group: 'Help' },
  { value: 'copy', label: 'Copy document', icon: Copy, group: 'Export' },
  { value: 'download', label: 'Download annotations', icon: Download, group: 'Export' },
];

const NowComposer: React.FC = () => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <span ref={anchorRef} className="w-fit bg-[oklch(0.86_0.17_95/0.35)] text-body">still open and the link text</span>
      <NowButton size="xs" variant="outline" onClick={() => setOpen(true)}>Open composer</NowButton>
      {open && anchorRef.current && (
        <CommentPopover
          anchorEl={anchorRef.current}
          contextText={QUOTE}
          copyText={QUOTE}
          isGlobal={false}
          quickLabels={DEFAULT_QUICK_LABELS}
          onQuickLabel={(l: QuickLabel) => { toast(`Label: ${l.text}`); setOpen(false); }}
          onSubmit={(t) => { toast(`Saved: ${t}`); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};

export const Gallery: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sw, setSw] = useState({ a: true, b: false });
  const [checked, setChecked] = useState<Set<number>>(new Set([0, 2]));
  const [view, setView] = useState(0);
  const [msg, setMsg] = useState('');
  const [msgFiles, setMsgFiles] = useState<File[]>([]);
  const toggleChecked = (i: number) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider delayDuration={300}>
        <div className="mx-auto max-w-275 px-8 pb-24 pt-10">
          <h1 className="text-title font-semibold">Fluid gallery</h1>
          <p className="mt-1 max-w-[70ch] text-caption text-muted-foreground">
            Each row puts the component Hypermark uses now next to the Fluid Functionalism one, both on the app theme.
            Both sides use Untitled UI icons. Dev only, not in the build.
          </p>

          <Row
            id="composer"
            title="Composer"
            tall
            note="Left: the real composer (click Open composer). Right: the new one, with quick labels as a Tab completion and images as name chips. Ctrl+C copies the quote, Ctrl+Enter adds, Escape discards, paste or drop images."
            now={<NowComposer />}
            fluid={(
              <NewComposer
                quote={QUOTE}
                quickLabels={DEFAULT_QUICK_LABELS}
                onSubmit={(t, files) => toast(`Added: ${t || '(no text)'}${files.length ? ` + ${files.length} image(s)` : ''}`)}
              />
            )}
          />

          <Row
            id="input-message"
            title="Fluid InputMessage (reference)"
            note="Fluid's own composer, shown as-is for its attachment tiles and send button. Enter sends here."
            now={<span className="text-caption text-muted-foreground">No equivalent.</span>}
            fluid={(
              <div className="w-full max-w-md">
                <InputMessage
                  value={msg}
                  onValueChange={setMsg}
                  files={msgFiles}
                  onFilesChange={setMsgFiles}
                  accept="image/png,image/jpeg"
                  onSend={(t) => { toast(`Sent: ${t}`); setMsg(''); setMsgFiles([]); }}
                  leftSlot={({ openFilePicker }) => (
                    <Button variant="ghost" size="icon-compact" aria-label="Attach" onClick={() => openFilePicker()}>
                      <Link size={16} />
                    </Button>
                  )}
                />
              </div>
            )}
          />

          <Row
            id="button"
            title="Button"
            note="ui/button.tsx vs Fluid Button (primary, secondary, tertiary, ghost)."
            now={(
              <>
                <NowButton>Approve</NowButton>
                <NowButton variant="secondary">Secondary</NowButton>
                <NowButton variant="outline">Feedback</NowButton>
                <NowButton variant="ghost">Ghost</NowButton>
                <NowButton size="sm" variant="outline" iconLeft={<Copy01 className="size-4" />}>Copy</NowButton>
              </>
            )}
            fluid={(
              <>
                <Button>Approve</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="tertiary">Feedback</Button>
                <Button variant="ghost">Ghost</Button>
                <Button size="compact" variant="tertiary" leadingIcon={Copy}>Copy</Button>
              </>
            )}
          />

          <Row
            id="tooltip"
            title="Tooltip"
            note="Hover each button."
            now={(
              <>
                <NowTooltip content="Copy plan"><NowButton size="sm" variant="outline">Short</NowButton></NowTooltip>
                <NowTooltip wide content="Copies the whole document, with your annotations, as Markdown."><NowButton size="sm" variant="outline">Wide</NowButton></NowTooltip>
              </>
            )}
            fluid={(
              <>
                <Tooltip content="Copy plan"><Button size="compact" variant="tertiary">Short</Button></Tooltip>
                <Tooltip content="Copies the whole document, with your annotations, as Markdown."><Button size="compact" variant="tertiary">Wide</Button></Tooltip>
              </>
            )}
          />

          <Row
            id="tabs"
            title="All / Current toggle"
            note="AnnotationPanel's scope toggle vs Fluid TabsSubtle."
            now={<NowScopeToggle />}
            fluid={(
              <TabsSubtle idPrefix="scope" size="compact" selectedIndex={tab} onSelect={setTab}>
                <TabsSubtleItem index={0} label="Current" />
                <TabsSubtleItem index={1} label="All" />
              </TabsSubtle>
            )}
          />

          <Row
            id="dropdown"
            title="Menu"
            note="ActionMenu vs Fluid Dropdown."
            now={(
              <ActionMenu renderTrigger={({ toggleMenu }) => <NowButton size="sm" variant="outline" onClick={toggleMenu}>Export</NowButton>}>
                {({ closeMenu }) => (
                  <>
                    <ActionMenuItem icon={<Copy01 className="size-4" />} label="Copy document" onClick={closeMenu} />
                    <ActionMenuItem icon={<Download01 className="size-4" />} label="Download" subtitle="Markdown file" onClick={closeMenu} />
                    <ActionMenuDivider />
                    <ActionMenuItem icon={<Link01 className="size-4" />} label="Copy share link" onClick={closeMenu} />
                  </>
                )}
              </ActionMenu>
            )}
            fluid={(
              <DropdownMenu>
                <DropdownTrigger render={<Button size="compact" variant="tertiary">Export</Button>} />
                <DropdownContent checkedIndex={view}>
                  <MenuItem index={0} icon={Copy} label="Copy document" checked={view === 0} onSelect={() => setView(0)} />
                  <MenuItem index={1} icon={Download} label="Download" checked={view === 1} onSelect={() => setView(1)} />
                  <DropdownSeparator />
                  <MenuItem index={2} icon={Link} label="Copy share link" checked={view === 2} onSelect={() => setView(2)} />
                </DropdownContent>
              </DropdownMenu>
            )}
          />

          <Row
            id="dialog"
            title="Dialog"
            note="ConfirmDialog vs Fluid Dialog."
            now={(
              <>
                <NowButton size="sm" variant="outline" onClick={() => setConfirmOpen(true)}>Open dialog</NowButton>
                <ConfirmDialog
                  isOpen={confirmOpen}
                  onClose={() => setConfirmOpen(false)}
                  onConfirm={() => setConfirmOpen(false)}
                  title="Discard annotations?"
                  message="This removes all 4 annotations on this message."
                  confirmText="Discard"
                  showCancel
                  variant="warning"
                />
              </>
            )}
            fluid={(
              <Dialog>
                <DialogTrigger render={<Button size="compact" variant="tertiary">Open dialog</Button>} />
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
            )}
          />

          <Row
            id="switch"
            title="Switch"
            note="DiffOptionsButton's toggle vs Fluid Switch."
            now={(
              <div className="flex flex-col">
                <NowSwitch label="Line numbers" checked={sw.a} onChange={(v) => setSw((s) => ({ ...s, a: v }))} />
                <NowSwitch label="Word wrap" checked={sw.b} onChange={(v) => setSw((s) => ({ ...s, b: v }))} />
              </div>
            )}
            fluid={(
              <div className="flex flex-col gap-1">
                <Switch label="Line numbers" checked={sw.a} onToggle={() => setSw((s) => ({ ...s, a: !s.a }))} />
                <Switch label="Word wrap" checked={sw.b} onToggle={() => setSw((s) => ({ ...s, b: !s.b }))} />
              </div>
            )}
          />

          <Row
            id="checkbox"
            title="Checkbox group"
            note="Nothing like it in the app now; a candidate for the quick-label list."
            now={<span className="text-caption text-muted-foreground">No equivalent.</span>}
            fluid={(
              <CheckboxGroup checkedIndices={checked}>
                {DEFAULT_QUICK_LABELS.slice(0, 4).map((l, i) => (
                  <CheckboxItem key={l.id} index={i} label={l.text} checked={checked.has(i)} onToggle={() => toggleChecked(i)} />
                ))}
              </CheckboxGroup>
            )}
          />

          <Row
            id="badge"
            title="Badge"
            note="The quick-label chip vs Fluid Badge, solid and dot. The dot row is option B of the open quick-label decision."
            now={(
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_QUICK_LABELS.map((l) => (
                  <span key={l.id} className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border border-border bg-card px-2.25 text-micro font-semibold text-foreground/85">{l.text}</span>
                ))}
              </div>
            )}
            fluid={(
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_QUICK_LABELS.map((l, i) => <Badge key={l.id} color={LABEL_COLORS[i]}>{l.text}</Badge>)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_QUICK_LABELS.map((l, i) => <Badge key={l.id} variant="dot" color={LABEL_COLORS[i]}>{l.text}</Badge>)}
                </div>
              </div>
            )}
          />

          <Row
            id="command"
            title="Command menu"
            note="Would replace the scattered top-bar settings with one searchable list."
            now={<span className="text-caption text-muted-foreground">Settings are separate buttons in the top bar.</span>}
            fluid={(
              <div className="h-80 w-full max-w-md overflow-hidden rounded-xl border border-border bg-popover">
                <CommandMenu items={COMMANDS} onSelect={(item) => toast(item.label)}>
                  <CommandMenuInput placeholder="Search settings and actions…" />
                  <CommandMenuList>
                    <CommandMenuEmpty>No results.</CommandMenuEmpty>
                  </CommandMenuList>
                </CommandMenu>
              </div>
            )}
          />

          <div className="mt-6 flex items-center gap-2 text-micro text-muted-foreground">
            <FileText size={12} /> Source: src/ui/fluid (vendored from fluidfunctionalism.com, MIT).
          </div>
        </div>
        <Toaster theme="dark" position="bottom-center" />
      </TooltipProvider>
    </ThemeProvider>
  );
};
