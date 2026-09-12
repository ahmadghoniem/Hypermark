import type { CodeAnnotation, ImageAttachment } from '@hypermark/ui/types';

/**
 * Describes what the reviewer was looking at in local-review mode — diff mode,
 * optional base branch, optional worktree. Threaded into the feedback header so
 * the receiving agent knows which diff the annotations are anchored to.
 */
export interface FeedbackDiffContext {
  mode: string;
  base?: string;
  worktreePath?: string | null;
  /** Subject of the active commit when mode is `commit:<sha>` — header readability only. */
  commitSubject?: string;
  /** Exact server snapshot for providers whose line anchors can outlive a refresh. */
  snapshotId?: string;
}

/** The sha when a `commit:<sha>` diff is (or was) the anchor, else undefined.
 *  Shared with App's annotation-stamping context so the stamp and the export
 *  comparison can never parse the mode differently. */
export function commitShaFromMode(mode: string | undefined): string | undefined {
  return mode?.startsWith('commit:') ? mode.slice('commit:'.length) : undefined;
}

function describeDiff(ctx: FeedbackDiffContext): string {
  const { mode, base, worktreePath } = ctx;
  let label: string;
  const commitSha = commitShaFromMode(mode);
  if (commitSha) {
    const subject = ctx.commitSubject ? ` — ${ctx.commitSubject}` : '';
    return `Commit \`${commitSha.slice(0, 7)}\`${subject} (diff vs its parent)${worktreePath ? ` _(worktree: ${worktreePath})_` : ''}`;
  }
  if (mode === 'gitbutler:workspace') {
    label = 'GitButler workspace (all applied changes)';
    return worktreePath ? `${label} _(worktree: ${worktreePath})_` : label;
  }
  for (const [prefix, kind] of [
    ['gitbutler:stack:', 'stack'],
    ['gitbutler:branch:', 'branch'],
  ] as const) {
    if (!mode.startsWith(prefix)) continue;
    let target = mode.slice(prefix.length);
    try { target = decodeURIComponent(target); } catch { /* keep encoded fallback */ }
    label = `GitButler ${kind} \`${target}\` (committed changes)`;
    return worktreePath ? `${label} _(worktree: ${worktreePath})_` : label;
  }
  switch (mode) {
    case "uncommitted":  label = "Uncommitted changes"; break;
    case "local-vs-remote": label = "Local vs remote branch (committed + uncommitted + untracked)"; break;
    case "staged":       label = "Staged changes"; break;
    case "unstaged":     label = "Unstaged changes"; break;
    case "last-commit":  label = "Last commit"; break;
    case "workspace-current":  label = "Workspace current changes"; break;
    case "workspace-staged":   label = "Workspace staged changes"; break;
    case "workspace-unstaged": label = "Workspace unstaged changes"; break;
    case "workspace-last":     label = "Workspace last change"; break;
    case "jj-current":   label = "Current change"; break;
    case "jj-last":      label = "Last change"; break;
    case "jj-line":      label = base ? `Line of work vs \`${base}\`` : "Line of work"; break;
    case "jj-all":       label = "All files"; break;
    case "since-base":   label = base ? `All changes since \`${base}\` (committed + uncommitted + untracked)` : "All changes since base (committed + uncommitted + untracked)"; break;
    case "branch":       label = base ? `Branch diff vs \`${base}\`` : "Branch diff"; break;
    case "merge-base":   label = base ? `Committed changes vs \`${base}\`` : "Committed changes"; break;
    case "all":          label = "All files"; break;
    default:             label = mode; // p4-* or anything else — show raw
  }
  return worktreePath ? `${label} _(worktree: ${worktreePath})_` : label;
}

/**
 * Anchor-mismatch note: an annotation made on a commit:<sha> diff carries
 * line numbers from THAT commit's diff-vs-parent — exporting it under any
 * other diff header (or vice versa) without saying so would silently point
 * the agent at the wrong code. Empty when the anchor matches the header.
 */
function commitMismatchNote(ann: CodeAnnotation, currentCommitSha?: string): string {
  if (ann.commitSha && ann.commitSha !== currentCommitSha) {
    const subject = ann.commitSubject ? ` ("${ann.commitSubject}")` : '';
    return `_Made on commit \`${ann.commitSha.slice(0, 7)}\`${subject} — anchored to that commit's diff, not the diff above._\n`;
  }
  if (!ann.commitSha && currentCommitSha) {
    return `_Made on a working-tree diff, not commit \`${currentCommitSha.slice(0, 7)}\` — anchored there._\n`;
  }
  return '';
}

function gitButlerMismatchNote(ann: CodeAnnotation, current?: FeedbackDiffContext): string {
  if (!ann.gitButlerDiffType) return '';
  const sameSnapshot = !ann.gitButlerSnapshotId || ann.gitButlerSnapshotId === current?.snapshotId;
  if (ann.gitButlerDiffType === current?.mode && ann.gitButlerBase === current.base && sameSnapshot) return '';
  const source = ann.gitButlerDiffLabel ?? describeDiff({
    mode: ann.gitButlerDiffType,
    base: ann.gitButlerBase,
  });
  return `_Made on ${source} — anchored to that GitButler diff, not the diff above._\n`;
}

function callFlowInlineCode(value: string): string {
  return `\`${value.replace(/`/g, '\u02cb')}\``;
}

/**
 * Serialize the complete Call Flow selection carried by one review annotation.
 * The annotation may be inline, file-scoped, or review-scoped; this context
 * keeps every Shift-clicked step in agent feedback.
 */
export function formatCallFlowAnnotationTargets(annotation: CodeAnnotation): string {
  if (!annotation.callFlowTargets?.length) return '';
  const rows = annotation.callFlowTargets.map((target) => {
    let source = 'inferred step';
    if (target.filePath && target.lineStart && target.lineEnd) {
      const line = target.lineStart === target.lineEnd
        ? `L${target.lineStart}`
        : `L${target.lineStart}-L${target.lineEnd}`;
      source = `${target.filePath}:${line}`;
    } else if (target.filePath) {
      source = target.filePath;
    } else if (target.rawLine) {
      source = `raw CallDiff line ${target.rawLine}`;
    }
    return `- ${callFlowInlineCode(target.entry)} → ${callFlowInlineCode(target.label)} — ${callFlowInlineCode(source)}`;
  });
  return `\n\n**Selected call-flow steps:**\n${rows.join('\n')}`;
}

function formatAttachedImages(images?: ImageAttachment[]): string {
  if (!images || images.length === 0) return '';
  let output = '\n**Attached images:**\n';
  for (const img of images) {
    output += `- [${img.name}] \`${img.path}\`\n`;
  }
  return output;
}

function formatFileAnnotations(fileAnnotations: CodeAnnotation[], headingLevel = '###', currentDiff?: FeedbackDiffContext): string {
  let output = '';

  const sorted = [...fileAnnotations].sort((a, b) => {
    const aScope = a.scope ?? 'line';
    const bScope = b.scope ?? 'line';
    if (aScope !== bScope) {
      return aScope === 'file' ? -1 : 1;
    }
    return a.lineStart - b.lineStart;
  });

  for (const ann of sorted) {
    const scope = ann.scope ?? 'line';

    if (scope === 'file') {
      output += `${headingLevel} File Comment\n`;
      output += commitMismatchNote(ann, commitShaFromMode(currentDiff?.mode));
      output += gitButlerMismatchNote(ann, currentDiff);
      if (ann.text) {
        output += `${ann.text}\n`;
      }
      output += formatCallFlowAnnotationTargets(ann);
      output += formatAttachedImages(ann.images);
      output += '\n';
      continue;
    }

    const lineRange = ann.lineStart === ann.lineEnd
      ? `Line ${ann.lineStart}`
      : `Lines ${ann.lineStart}-${ann.lineEnd}`;
    const tokenSuffix = ann.tokenText
      ? ` — \`\`${ann.tokenText.replace(/`/g, '\\`')}\`\`${ann.charStart != null ? ` (chars ${ann.charStart}-${ann.charEnd})` : ''}`
      : '';
    output += `${headingLevel} ${lineRange} (${ann.side})${tokenSuffix}\n`;
    output += commitMismatchNote(ann, commitShaFromMode(currentDiff?.mode));
    output += gitButlerMismatchNote(ann, currentDiff);

    if (ann.text) {
      output += `${ann.text}\n`;
    }
    if (ann.reasoning) {
      output += `\n**Reasoning:** ${ann.reasoning}\n`;
    }
    output += formatCallFlowAnnotationTargets(ann);
    output += formatSelectedTextBlock(ann);
    output += formatAttachedImages(ann.images);
    output += '\n';
  }

  return output;
}

/**
 * The highlighted-text payload for an annotation that carries the exact text
 * the reviewer had selected, so the agent sees what was highlighted even when
 * it differs from the anchored diff lines.
 */
function formatSelectedTextBlock(ann: CodeAnnotation): string {
  if (!ann.selectedText) return '';
  return `\n**Highlighted text:**\n\`\`\`\n${ann.selectedText}\n\`\`\`\n`;
}

function renderGeneralComments(annotations: CodeAnnotation[]): string {
  let output = '## General\n\n';
  for (const ann of annotations) {
    if (ann.text) {
      output += `${ann.text}\n`;
    }
    if (ann.reasoning) {
      output += `\n**Reasoning:** ${ann.reasoning}\n`;
    }
    output += formatCallFlowAnnotationTargets(ann);
    output += formatAttachedImages(ann.images);
    output += '\n';
  }
  return output;
}

function groupByFile(annotations: CodeAnnotation[]): Map<string, CodeAnnotation[]> {
  const grouped = new Map<string, CodeAnnotation[]>();
  for (const ann of annotations) {
    const existing = grouped.get(ann.filePath) || [];
    existing.push(ann);
    grouped.set(ann.filePath, existing);
  }
  return grouped;
}

function renderFileGroups(grouped: Map<string, CodeAnnotation[]>, headingLevel: string, currentDiff?: FeedbackDiffContext): string {
  const annotationHeading = headingLevel + '#';
  let output = '';
  for (const [filePath, fileAnnotations] of grouped) {
    output += `${headingLevel} ${filePath}\n\n`;
    output += formatFileAnnotations(fileAnnotations, annotationHeading, currentDiff);
  }
  return output;
}

/**
 * Build markdown feedback from code review annotations.
 *
 * An optional diffContext adds one line describing which diff the reviewer
 * was looking at — otherwise the agent only sees file paths and line numbers
 * and has to guess which diff those anchor to.
 */
export function exportReviewFeedback(
  annotations: CodeAnnotation[],
  diffContext?: FeedbackDiffContext,
): string {
  if (annotations.length === 0) {
    return '# Code Review\n\nNo feedback provided.';
  }

  // General (review-level) comments belong to no file — render them in their own
  // section and group only the rest by file.
  const general = annotations.filter(a => (a.scope ?? 'line') === 'general');
  const placed = annotations.filter(a => (a.scope ?? 'line') !== 'general');
  const generalSection = general.length > 0 ? renderGeneralComments(general) : '';

  let output = `# Code Review Feedback\n\n${diffContext ? `**Diff:** ${describeDiff(diffContext)}\n\n` : ''}`;

  output += renderFileGroups(groupByFile(placed), '##', diffContext);
  output += generalSection;
  return output;
}
