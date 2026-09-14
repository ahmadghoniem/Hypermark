/**
 * Per-row decoration for the @pierre/trees file tree (spec 04, step 3).
 *
 * spec/04-file-tree.md:67-68 requires that the replacement tree preserve
 * "applicable annotation counts, and active-file highlighting". The old
 * `FileTreeNodeItem` rendered those as separate React elements per row
 * (`ChangeTypeLetter`, `AnnotationBadge`, `DiffCounts`, `CommittedDot`).
 *
 * `@pierre/trees` exposes exactly ONE decoration slot per row, and it is
 * declarative rather than a render prop: `FileTreeRowDecoration` is either a
 * `{ text, title?, parts? }` or a `{ icon, title? }`, never arbitrary markup
 * and never interactive. So the whole right-hand metadata column collapses
 * into a single text decoration whose `parts` carry their own colors.
 *
 * There is one `title` for the whole decoration, not one per bit, so the
 * per-bit tooltips ("Added file", "3 annotations", ...) are folded into a
 * single composed string.
 *
 * Colors are theme CSS custom properties. They resolve inside the tree's
 * shadow root because custom properties inherit through the shadow boundary,
 * which is also why this must NOT hard-code hex values: doing so would break
 * the seven-palette contract spec 03 just established.
 */
import type { DiffFile } from '../types';

/** One colored run inside a row decoration. Mirrors `FileTreeRowDecorationTextPart`. */
interface RowDecorationPart {
  text: string;
  color?: string;
}

/** Mirrors the `FileTreeRowDecorationText` half of `FileTreeRowDecoration`. */
export interface RowDecoration {
  text: string;
  title?: string;
  parts: RowDecorationPart[];
}

/** Since-base sidecar entry, as `FileTree` already receives it. */
interface SectionEntry {
  group: 'committed' | 'changes' | 'untracked';
}

const COLOR_ADDED = 'var(--success)';
const COLOR_DELETED = 'var(--destructive)';
const COLOR_RENAMED = 'var(--primary)';
const COLOR_MUTED = 'var(--muted-foreground)';
const COLOR_ANNOTATION = 'var(--primary)';

/**
 * The leading change-type letter, matching `ChangeTypeLetter`'s rules: A/D/R/U
 * carry weight and color, modified gets a quiet M so the column has no holes.
 */
function changeTypeLetter(
  file: DiffFile,
  untracked: boolean,
): { part: RowDecorationPart; title: string } {
  if (untracked) {
    return { part: { text: 'U', color: COLOR_MUTED }, title: 'Untracked file' };
  }
  switch (file.status) {
    case 'added':
      return { part: { text: 'A', color: COLOR_ADDED }, title: 'Added file' };
    case 'deleted':
      return { part: { text: 'D', color: COLOR_DELETED }, title: 'Deleted file' };
    case 'renamed':
      return {
        part: { text: 'R', color: COLOR_RENAMED },
        title: file.oldPath ? `Renamed from ${file.oldPath}` : 'Renamed file',
      };
    default:
      return { part: { text: 'M', color: COLOR_MUTED }, title: 'Modified file' };
  }
}

export interface BuildRowDecorationInput {
  file: DiffFile;
  annotationCount: number;
  /** Since-base sidecar entry, when in since-base mode. */
  sectionEntry?: SectionEntry;
}

/**
 * Composes one row's decoration. Returns `null` when a file has nothing to
 * show, so the library renders no decoration at all rather than an empty span.
 *
 * Ordering mirrors the old row: change-type letter, committed dot,
 * annotation count, then the additions/deletions pair.
 */
export function buildRowDecoration(input: BuildRowDecorationInput): RowDecoration | null {
  const { file, annotationCount, sectionEntry } = input;
  const parts: RowDecorationPart[] = [];
  const titles: string[] = [];

  const untracked = sectionEntry?.group === 'untracked';
  const letter = changeTypeLetter(file, untracked);
  parts.push(letter.part);
  titles.push(letter.title);

  // Since-base mode distinguishes already-committed rows from working ones.
  if (sectionEntry?.group === 'committed') {
    parts.push({ text: '●', color: COLOR_MUTED });
    titles.push('Committed since base');
  }

  if (annotationCount > 0) {
    parts.push({ text: `✎${annotationCount}`, color: COLOR_ANNOTATION });
    titles.push(`${annotationCount} annotation${annotationCount === 1 ? '' : 's'}`);
  }

  const { additions, deletions } = getChangeCountsFor(file);
  if (additions > 0) {
    parts.push({ text: `+${additions}`, color: COLOR_ADDED });
  }
  if (deletions > 0) {
    parts.push({ text: `-${deletions}`, color: COLOR_DELETED });
  }

  if (parts.length === 0) return null;

  return {
    text: parts.map(part => part.text).join(' '),
    title: titles.join(' · '),
    parts,
  };
}

/** Local mirror of the adapter's `getChangeCounts` so this module stays a pure
 *  formatter with no import cycle back through the adapter. */
function getChangeCountsFor(file: DiffFile): { additions: number; deletions: number } {
  return { additions: file.additions, deletions: file.deletions };
}
