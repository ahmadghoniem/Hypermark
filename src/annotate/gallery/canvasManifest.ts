/**
 * What the canvas shows, as data: groups, their slots, and the states left
 * out on purpose. CanvasGroups.tsx must render every slot listed here; the
 * CanvasRenderers type makes a missing or extra slot a type error.
 *
 * Each group shows one component (or one feature) across the states worth
 * comparing, with the Fluid version last where one exists.
 */
import type { ReactNode } from 'react';

interface SlotSpec { readonly id: string; readonly label: string; readonly span?: number }
interface GroupSpec {
  readonly id: string;
  readonly title: string;
  readonly columns: number;
  readonly slotWidth: number;
  readonly slots: readonly SlotSpec[];
}

export const CANVAS_GROUPS = [
  {
    id: 'composer',
    title: 'Composer',
    columns: 4,
    slotWidth: 400,
    slots: [
      { id: 'now-quote', label: 'Now, on a highlight' },
      { id: 'now-edit', label: 'Now, editing a comment' },
      { id: 'now-global', label: 'Now, global comment' },
      { id: 'fluid', label: 'Fluid' },
    ],
  },
  {
    id: 'panel',
    title: 'Annotations panel',
    columns: 5,
    slotWidth: 300,
    slots: [
      { id: 'empty', label: 'Empty' },
      { id: 'cards', label: 'One card of each kind' },
      { id: 'selected', label: 'A card selected' },
      { id: 'all', label: 'All messages' },
      { id: 'fluid-tabs', label: 'Fluid, the Current / All switch' },
    ],
  },
  {
    id: 'rail',
    title: 'Message rail',
    columns: 3,
    slotWidth: 260,
    slots: [
      { id: 'shown', label: 'Short messages shown' },
      { id: 'hidden', label: 'Short messages hidden' },
      { id: 'short-open', label: 'The open message is short' },
    ],
  },
  {
    id: 'send',
    title: 'Send control',
    columns: 4,
    slotWidth: 260,
    slots: [
      { id: 'all-good', label: 'Nothing to send' },
      { id: 'feedback', label: 'Three annotations' },
      { id: 'gate', label: 'Approval gate' },
      { id: 'gate-feedback', label: 'Approval gate, with annotations' },
    ],
  },
  {
    id: 'header',
    title: 'Header',
    columns: 2,
    slotWidth: 1100,
    slots: [
      { id: 'now', label: 'Now' },
      { id: 'fluid-command', label: 'Fluid, command menu' },
    ],
  },
  {
    id: 'toc',
    title: 'Table of contents',
    columns: 3,
    slotWidth: 260,
    slots: [
      { id: 'plain', label: 'No section active' },
      { id: 'active', label: 'A section active' },
      { id: 'counts', label: 'With annotation counts' },
    ],
  },
  {
    id: 'dialogs',
    title: 'Dialogs',
    columns: 4,
    slotWidth: 260,
    slots: [
      { id: 'shortcuts', label: 'Keyboard shortcuts' },
      { id: 'labels', label: 'Quick labels' },
      { id: 'confirm', label: 'Confirm' },
      { id: 'fluid', label: 'Fluid' },
    ],
  },
  {
    id: 'code',
    title: 'Code files',
    columns: 2,
    slotWidth: 320,
    slots: [
      { id: 'popout', label: 'Popout' },
      { id: 'picker', label: 'Picker, for a link that matches several files' },
    ],
  },
  {
    id: 'completion',
    title: 'Completion screen',
    columns: 3,
    slotWidth: 480,
    slots: [
      { id: 'approved', label: 'Approved' },
      { id: 'feedback', label: 'Feedback sent' },
      { id: 'exited', label: 'Session closed' },
    ],
  },
  {
    id: 'typography',
    title: 'Document',
    columns: 1,
    slotWidth: 820,
    slots: [
      { id: 'viewer', label: 'Every block type. Select text to annotate.' },
    ],
  },
  {
    id: 'tab',
    title: 'Tab selection',
    columns: 4,
    slotWidth: 360,
    slots: [
      { id: 'one', label: 'One paragraph' },
      { id: 'several', label: 'Several blocks' },
      { id: 'list-code', label: 'A list and a code block' },
      { id: 'hints', label: 'Pointer hints. Hover the boxes.' },
    ],
  },
  {
    id: 'plan-diff',
    title: 'Plan diff controls',
    columns: 4,
    slotWidth: 300,
    slots: [
      { id: 'badge', label: 'Badge' },
      { id: 'badge-active', label: 'Badge, diff showing' },
      { id: 'badge-baseline', label: 'Badge, older baseline' },
      { id: 'lane', label: 'Sticky lane' },
      { id: 'versions-loading', label: 'Versions, loading' },
      { id: 'versions', label: 'Versions' },
      { id: 'versions-base', label: 'Versions, older base picked' },
      { id: 'versions-fetching', label: 'Versions, fetching one' },
    ],
  },
  {
    id: 'plan-diff-view',
    title: 'Plan diff',
    columns: 1,
    slotWidth: 820,
    slots: [
      { id: 'rendered', label: 'Rendered, v2 against v1. Select text to annotate.' },
    ],
  },
  {
    id: 'side-chat',
    title: 'Side chat (proposal)',
    columns: 2,
    slotWidth: 900,
    slots: [
      { id: 'card', label: 'Corner card' },
      { id: 'column', label: 'Column' },
      { id: 'panel', label: 'In the panel' },
      { id: 'inline', label: 'Under the highlight' },
    ],
  },
] as const satisfies readonly GroupSpec[];

/** States and components left off the canvas, and why. */
export const CANVAS_OMISSIONS: readonly { what: string; why: string }[] = [
  { what: 'Images in the composer, cards and document', why: 'Image previews load from /api/image, which the dev server does not serve.' },
  { what: 'The narrow header', why: 'Its layout follows the window width, so a narrow frame on the canvas still shows the wide one.' },
  { what: 'Plan diff badge with no earlier version', why: 'It renders nothing.' },
  { what: 'Mermaid and Graphviz diagrams', why: 'They load large renderers on demand; they are document content more than app UI.' },
  { what: 'Review app components', why: 'This canvas covers the annotate app.' },
  { what: 'The proposed table of contents style', why: 'Waiting on a decision.' },
  { what: 'Fluid versions of the panel, rail, TOC, plan diff and completion screen', why: 'None built yet.' },
];

type Group = (typeof CANVAS_GROUPS)[number];
export type CanvasGroupId = Group['id'];
type SlotIds<G extends CanvasGroupId> = Extract<Group, { id: G }>['slots'][number]['id'];

/** One render function per slot, for every group. */
export type CanvasRenderers = { [G in CanvasGroupId]: Record<SlotIds<G>, () => ReactNode> };
