import React, { useState, useRef, useEffect } from 'react';
import { AnnotationType, type Annotation, type Block, type CodeAnnotation } from '../types';
import { ImageThumbnail } from './ImageThumbnail';
import { useIsMobile } from '../hooks/useIsMobile';
import { OverlayScrollArea } from './OverlayScrollArea';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { copyTextToClipboard } from '../utils/clipboard';
import { resolveReplyParents, resolveThreadRootTimestamps } from '@/shared/annotation-threads';
import { fileName as pathFileName } from '../utils/displayPath';
import { formatRelativeTime, railPreview } from '../utils/messageRail';

import { Check, Copy01, Edit05, Trash01, XClose } from '@untitledui/icons';
export type AnnotationScope = 'this' | 'all';

export interface AnnotationMessageGroup {
  messageId: string;
  text: string;
  timestamp?: string;
  isCurrent?: boolean;
  annotations: Annotation[];
  codeAnnotations?: CodeAnnotation[];
}

// Card type-word colors. Deletion uses `destructive` (reliably red on every
// theme, matching the in-document .deletion highlight). Comment uses the
// `annotation-comment` token, which defaults to each theme's --accent (so it
// stays consistent with the .comment highlight) but is overridden to a legible
// blue in neutral themes whose accent is a low-contrast gray (e.g. "simple").
// Global has no in-document highlight, so it uses a fixed legible purple.
const TYPE_COLOR: Record<AnnotationType, string> = {
  [AnnotationType.DELETION]: 'text-destructive',
  [AnnotationType.COMMENT]: 'text-annotation-comment',
  [AnnotationType.GLOBAL_COMMENT]: 'text-purple-500',
};

const TYPE_LABEL: Record<AnnotationType, string> = {
  [AnnotationType.DELETION]: 'Deletion',
  [AnnotationType.COMMENT]: 'Comment',
  [AnnotationType.GLOBAL_COMMENT]: 'Global',
};

const PencilIcon = () => (
  <Edit05 className="size-3" />
);

const TrashCardIcon = () => (
  <Trash01 className="size-3" />
);

const CopyCardIcon = () => (
  <Copy01 className="size-3" />
);

const CheckCardIcon = () => (
  <Check className="size-3" />
);

const CARD_ACTION_CLASS = "relative rounded-md p-1.5 text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:text-foreground";

/** Bottom-right card actions: copy always, edit and delete unless read-only. */
const CardActions: React.FC<{
  copyText: string;
  onEdit?: () => void;
  onDelete?: () => void;
}> = ({ copyText, onEdit, onDelete }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 -mb-1 flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
      <button
        type="button"
        onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          if (!(await copyTextToClipboard(copyText))) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className={cn(CARD_ACTION_CLASS, copied && 'text-success hover:text-success')}
        title={copied ? 'Copied' : 'Copy annotation'}
        aria-label={copied ? 'Copied' : 'Copy annotation'}
      >
        {copied ? <CheckCardIcon /> : <CopyCardIcon />}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onEdit(); }}
          className={CARD_ACTION_CLASS}
          title="Edit annotation"
          aria-label="Edit annotation"
        >
          <PencilIcon />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onDelete(); }}
          className={cn(CARD_ACTION_CLASS, 'hover:text-destructive')}
          title="Delete annotation"
          aria-label="Delete annotation"
        >
          <TrashCardIcon />
        </button>
      )}
    </div>
  );
};

/** In-place comment editor: Enter saves, Shift+Enter adds a line, Escape cancels. */
const InlineCommentEditor: React.FC<{
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}> = ({ initialText, onSave, onCancel }) => {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const save = () => {
    if (text.trim()) onSave(text);
  };
  return (
    <div onClick={(e: React.MouseEvent) => e.stopPropagation()}>
      <textarea
        data-pn-mobile-editable="true"
        ref={textareaRef}
        value={text}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder="Add your comment..."
        aria-label="Annotation comment"
        className="w-full resize-none rounded-lg border border-border/50 bg-card px-2.5 py-2 text-body text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
        style={{ fieldSizing: 'content', minHeight: 44 } as React.CSSProperties}
      />
      <div className="mt-1.5 flex justify-end gap-1.5">
        <Button variant="ghost" size="xxs" onClick={onCancel}>Cancel</Button>
        <Button size="xxs" disabled={!text.trim()} onClick={save}>Save</Button>
      </div>
    </div>
  );
};

/**
 * Order annotations so every reply follows its parent (replies among
 * themselves stay in creation order). The threading rule is the shared one
 * (resolveReplyParents, also what the export applies): a reply whose parent
 * is absent, a self-reference, and every member of an `inReplyTo` cycle
 * render as top-level cards in input order, so nothing is ever dropped.
 * Without any `inReplyTo` the input order is returned unchanged, so
 * annotations without replies render exactly as before.
 */
export function threadReplies(sorted: Annotation[]): Array<{ annotation: Annotation; isReply: boolean }> {
  if (!sorted.some((a) => a.inReplyTo)) return sorted.map((annotation) => ({ annotation, isReply: false }));
  const parents = resolveReplyParents(sorted);
  const byParent = new Map<string, Annotation[]>();
  for (const a of sorted) {
    const parent = parents.get(a.id);
    if (!parent) continue;
    const list = byParent.get(parent) ?? [];
    list.push(a);
    byParent.set(parent, list);
  }
  // Depth-first, iteratively: a 5,000-deep chain must not recurse 5,000
  // frames deep. The stack holds each node's replies in reverse so they pop
  // in creation order.
  const out: Array<{ annotation: Annotation; isReply: boolean }> = [];
  const stack: Array<{ annotation: Annotation; isReply: boolean }> = [];
  const pushReplies = (a: Annotation) => {
    const replies = byParent.get(a.id);
    if (!replies) return;
    for (let i = replies.length - 1; i >= 0; i--) stack.push({ annotation: replies[i], isReply: true });
  };
  for (const a of sorted) {
    if (parents.get(a.id)) continue;
    out.push({ annotation: a, isReply: false });
    pushReplies(a);
    while (stack.length > 0) {
      const next = stack.pop()!;
      out.push(next);
      pushReplies(next.annotation);
    }
  }
  return out;
}

interface PanelProps {
  isOpen: boolean;
  annotations: Annotation[];
  blocks: Block[];
  onSelectAnnotation: (id: string, messageId?: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onEditAnnotation?: (id: string, updates: Partial<Annotation>) => void;
  selectedId: string | null;
  codeAnnotations?: CodeAnnotation[];
  onSelectCodeAnnotation?: (id: string, messageId?: string) => void;
  onDeleteCodeAnnotation?: (id: string) => void;
  onEditCodeAnnotation?: (id: string, updates: Partial<CodeAnnotation>) => void;
  scope?: AnnotationScope;
  onScopeChange?: (scope: AnnotationScope) => void;
  messageGroups?: AnnotationMessageGroup[];
  /** Explicit width, for hosts that size the panel themselves (the review
   *  editor still drags its panel). Omitted, the `width` dial decides. */
  width?: number | string;
  onClose?: () => void;
  otherFileAnnotations?: { count: number; files: number };
}

export const AnnotationPanel: React.FC<PanelProps> = ({
  isOpen,
  annotations,
  onSelectAnnotation,
  onDeleteAnnotation,
  onEditAnnotation,
  selectedId,
  codeAnnotations = [],
  onSelectCodeAnnotation,
  onDeleteCodeAnnotation,
  onEditCodeAnnotation,
  width,
  onClose,
  otherFileAnnotations,
  scope,
  onScopeChange,
  messageGroups,
}) => {
  const isMobile = useIsMobile();
  const mobilePanel = isMobile;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (scope === 'all') setNow(Date.now());
  }, [scope]);
  const listRef = useRef<HTMLDivElement>(null);
  const sortedAnnotations = [...annotations].sort((a, b) => a.createdA - b.createdA);
  const sortedCodeAnnotations = [...codeAnnotations].sort((a, b) => a.createdAt - b.createdAt);
  // Replies (`inReplyTo`) thread under their parent: each reply is lifted to
  // sit right after its parent (and the parent's earlier replies) at the
  // parent's timeline position. With no replies the order is untouched.
  const threadedAnnotations = threadReplies(sortedAnnotations);
  // Thread timestamps are resolved once per render, linearly (shared helper),
  // and the comparator only reads the map: resolving each chain inside the
  // comparator with a linear parent lookup was O(n^2 log n) and froze the
  // tab on a few thousand threaded comments.
  const threadRootTs = resolveThreadRootTimestamps(sortedAnnotations);
  const timelineEntries = [
    ...threadedAnnotations.map(({ annotation, isReply }) => ({ kind: 'plan' as const, ts: annotation.createdA, threadTs: threadRootTs.get(annotation.id) ?? annotation.createdA, annotation, isReply })),
    ...sortedCodeAnnotations.map(annotation => ({ kind: 'code' as const, ts: annotation.createdAt, threadTs: annotation.createdAt, annotation, isReply: false })),
  ].sort((a, b) => {
    if (a.threadTs !== b.threadTs) return a.threadTs - b.threadTs;
    return a.ts - b.ts;
  });
  const totalCount = scope === 'all' && messageGroups
    ? messageGroups.reduce((acc, g) => acc + g.annotations.length + (g.codeAnnotations?.length ?? 0), 0)
    : annotations.length + codeAnnotations.length;

  // Scroll selected annotation card into view
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const card = listRef.current.querySelector(`[data-annotation-id="${selectedId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedId]);

  if (!isOpen) return null;

  const panel = (
    <aside
      data-annotation-panel="true"
      data-plan-sidebar="right"
      className={`bg-card flex flex-col shrink-0 ${
        mobilePanel ? 'fixed top-12 bottom-0 right-0 z-panel w-full max-w-sm shadow-2xl' : ''
      }`}
      style={mobilePanel ? undefined : { width: width ?? 288 }}
    >
      {/* Header */}
      <div>
        <div className="flex h-10 items-center justify-between gap-2 px-3">
          <h2 className="text-caption font-semibold text-foreground">
            Annotations
          </h2>
          <div className="flex items-center gap-1">
            {scope && onScopeChange && (
              <div
                role="tablist"
                aria-label="Annotation scope"
                className="inline-flex items-center rounded-md bg-muted/60 p-0.5 text-micro"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={scope === 'this'}
                  onClick={() => onScopeChange('this')}
                  className={`rounded-sm px-1.5 py-0.5 font-semibold transition-all ${
                    scope === 'this'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Current
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={scope === 'all'}
                  onClick={() => onScopeChange('all')}
                  className={`rounded-sm px-1.5 py-0.5 font-semibold transition-all ${
                    scope === 'all'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All
                </button>
              </div>
            )}
            {mobilePanel && onClose && (
              <button
                onClick={onClose}
                className="relative rounded-md p-1.5 text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:text-foreground md:hidden"
                title="Close panel"
                aria-label="Close panel"
              >
                <XClose className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        {otherFileAnnotations && otherFileAnnotations.count > 0 && (
          <p className="px-3 pb-2 text-micro text-muted-foreground">
            +{otherFileAnnotations.count} in {otherFileAnnotations.files} other file{otherFileAnnotations.files === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {/* List */}
      <OverlayScrollArea className="flex-1 min-h-0">
        <div ref={listRef} className="p-2 flex flex-col gap-1.5">
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <p className="text-caption text-muted-foreground/60">
              No annotations yet
            </p>
            <p className="mt-1 text-micro text-muted-foreground/40">
              Select text to annotate
            </p>
          </div>
        ) : scope === 'all' && messageGroups ? (
          <>
            {messageGroups.map((group) => {
              const groupSortedAnnotations = [...group.annotations].sort((a, b) => a.createdA - b.createdA);
              const groupSortedCodeAnnotations = [...(group.codeAnnotations ?? [])].sort((a, b) => a.createdAt - b.createdAt);
              const groupThreaded = threadReplies(groupSortedAnnotations);
              const groupThreadRootTs = resolveThreadRootTimestamps(groupSortedAnnotations);
              const groupEntries = [
                ...groupThreaded.map(({ annotation, isReply }) => ({
                  kind: 'plan' as const,
                  ts: annotation.createdA,
                  threadTs: groupThreadRootTs.get(annotation.id) ?? annotation.createdA,
                  annotation,
                  isReply,
                })),
                ...groupSortedCodeAnnotations.map((annotation) => ({
                  kind: 'code' as const,
                  ts: annotation.createdAt,
                  threadTs: annotation.createdAt,
                  annotation,
                  isReply: false,
                })),
              ].sort((a, b) => {
                if (a.threadTs !== b.threadTs) return a.threadTs - b.threadTs;
                return a.ts - b.ts;
              });

              if (groupEntries.length === 0) return null;

              const relTime = formatRelativeTime(group.timestamp, now);
              return (
                <div key={group.messageId} data-message-group={group.messageId} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 px-1 pt-2 pb-0.5 text-micro font-semibold text-muted-foreground">
                    <span className="truncate">{railPreview(group.text)}</span>
                    {relTime && (
                      <span className="shrink-0 text-micro text-muted-foreground/60">{relTime}</span>
                    )}
                  </div>
                  {groupEntries.map((entry) => (
                    entry.kind === 'plan' ? (
                      entry.isReply ? (
                        <div
                          key={entry.annotation.id}
                          data-annotation-reply="true"
                          className="ml-3 border-l-2 border-border/40 pl-1.5"
                        >
                          <AnnotationCard
                            annotation={entry.annotation}
                            isSelected={selectedId === entry.annotation.id}
                            onSelect={() => onSelectAnnotation(entry.annotation.id, group.messageId)}
                            onDelete={() => onDeleteAnnotation(entry.annotation.id)}
                            onEdit={onEditAnnotation ? (updates: Partial<Annotation>) => onEditAnnotation(entry.annotation.id, updates) : undefined}
                            readOnly={!group.isCurrent}
                          />
                        </div>
                      ) : (
                        <AnnotationCard
                          key={entry.annotation.id}
                          annotation={entry.annotation}
                          isSelected={selectedId === entry.annotation.id}
                          onSelect={() => onSelectAnnotation(entry.annotation.id, group.messageId)}
                          onDelete={() => onDeleteAnnotation(entry.annotation.id)}
                          onEdit={onEditAnnotation ? (updates: Partial<Annotation>) => onEditAnnotation(entry.annotation.id, updates) : undefined}
                          readOnly={!group.isCurrent}
                        />
                      )
                    ) : (
                      <CodeAnnotationCard
                        key={entry.annotation.id}
                        annotation={entry.annotation}
                        isSelected={selectedId === entry.annotation.id}
                        onSelect={() => onSelectCodeAnnotation?.(entry.annotation.id, group.messageId)}
                        onDelete={() => onDeleteCodeAnnotation?.(entry.annotation.id)}
                        onEdit={onEditCodeAnnotation ? (updates: Partial<CodeAnnotation>) => onEditCodeAnnotation(entry.annotation.id, updates) : undefined}
                        readOnly={!group.isCurrent}
                      />
                    )
                  ))}
                </div>
              );
            })}
          </>
        ) : (
          <>
            {timelineEntries.map(entry => (
              entry.kind === 'plan' ? (
                entry.isReply ? (
                  <div
                    key={entry.annotation.id}
                    data-annotation-reply="true"
                    className="ml-3 border-l-2 border-border/40 pl-1.5"
                  >
                    <AnnotationCard
                      annotation={entry.annotation}
                      isSelected={selectedId === entry.annotation.id}
                      onSelect={() => onSelectAnnotation(entry.annotation.id)}
                      onDelete={() => onDeleteAnnotation(entry.annotation.id)}
                      onEdit={onEditAnnotation ? (updates: Partial<Annotation>) => onEditAnnotation(entry.annotation.id, updates) : undefined}
                    />
                  </div>
                ) : (
                <AnnotationCard
                  key={entry.annotation.id}
                  annotation={entry.annotation}
                  isSelected={selectedId === entry.annotation.id}
                  onSelect={() => onSelectAnnotation(entry.annotation.id)}
                  onDelete={() => onDeleteAnnotation(entry.annotation.id)}
                  onEdit={onEditAnnotation ? (updates: Partial<Annotation>) => onEditAnnotation(entry.annotation.id, updates) : undefined}
                />
                )
              ) : (
                <CodeAnnotationCard
                  key={entry.annotation.id}
                  annotation={entry.annotation}
                  isSelected={selectedId === entry.annotation.id}
                  onSelect={() => onSelectCodeAnnotation?.(entry.annotation.id)}
                  onDelete={() => onDeleteCodeAnnotation?.(entry.annotation.id)}
                  onEdit={onEditCodeAnnotation ? (updates: Partial<CodeAnnotation>) => onEditCodeAnnotation(entry.annotation.id, updates) : undefined}
                />
              )
            ))}
          </>
        )}
        </div>
      </OverlayScrollArea>
    </aside>
  );

  if (mobilePanel) {
    return (
      <>
        <div
          className="fixed inset-0 z-panel-scrim bg-background/60 backdrop-blur-sm"
          onClick={onClose}
        />
        {panel}
      </>
    );
  }

  return panel;
};

function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const AnnotationCard: React.FC<{
  annotation: Annotation;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onEdit?: (updates: Partial<Annotation>) => void;
  readOnly?: boolean;
}> = ({ annotation, isSelected, onSelect, onDelete, onEdit, readOnly = false }) => {
  const [isEditing, setIsEditing] = useState(false);

  const typeColor = TYPE_COLOR[annotation.type] ?? 'text-muted-foreground';
  const typeLabel = TYPE_LABEL[annotation.type] ?? 'Note';
  const isGlobal = annotation.type === AnnotationType.GLOBAL_COMMENT;
  const canEdit = !readOnly && !!onEdit && annotation.type !== AnnotationType.DELETION;
  const copyText = annotation.type === AnnotationType.DELETION
    ? annotation.originalText ?? ''
    : annotation.text || annotation.originalText || '';

  const editor = (
    <InlineCommentEditor
      initialText={annotation.text ?? ''}
      onSave={(text) => {
        onEdit?.({ text });
        setIsEditing(false);
      }}
      onCancel={() => setIsEditing(false)}
    />
  );

  return (
    <div
      data-annotation-id={annotation.id}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'group w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        isSelected ? 'bg-surface-1 ring-1 ring-border/50' : 'hover:bg-surface-1/50',
      )}
    >
      {/* Header: type word + chips, time on the right */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={cn('text-micro font-semibold', typeColor)}>{typeLabel}</span>
        {annotation.diffContext && (
          <span className="text-micro px-1.5 py-0.5 rounded-sm font-semibold bg-muted text-muted-foreground">
            diff
          </span>
        )}
        <span className="ml-auto shrink-0 text-micro text-muted-foreground/50">
          {formatTimestamp(annotation.createdA)}
        </span>
      </div>

      {/* Global Comment - show text directly */}
      {isGlobal ? (
        isEditing ? editor : (
          <p className="whitespace-pre-wrap text-body text-foreground/90">
            {annotation.text}
          </p>
        )
      ) : (
        <>
          {/* Quote — the annotated text */}
          <p className="mb-1.5 line-clamp-2 whitespace-pre-wrap font-mono text-micro/relaxed text-muted-foreground/80">
            "{annotation.originalText}"
          </p>

          {/* Comment/Replacement Text */}
          {annotation.type !== AnnotationType.DELETION && (
            isEditing ? editor : annotation.text && (
              <p className="whitespace-pre-wrap text-body text-foreground/90">
                {annotation.text}
              </p>
            )
          )}
        </>
      )}

      {/* Attached Images */}
      {annotation.images && annotation.images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {annotation.images.map((img, idx) => (
            <div key={idx} className="text-center">
              <ImageThumbnail
                path={img.path}
                size="sm"
                showRemove={false}
              />
              <div className="text-micro text-muted-foreground truncate max-w-12" title={img.name}>{img.name}</div>
            </div>
          ))}
        </div>
      )}

      {!isEditing && (
        <CardActions
          copyText={copyText}
          onEdit={canEdit ? () => setIsEditing(true) : undefined}
          onDelete={readOnly ? undefined : onDelete}
        />
      )}
    </div>
  );
};

const CodeAnnotationCard: React.FC<{
  annotation: CodeAnnotation;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onEdit?: (updates: Partial<CodeAnnotation>) => void;
  readOnly?: boolean;
}> = ({ annotation, isSelected, onSelect, onDelete, onEdit, readOnly = false }) => {
  const [isEditing, setIsEditing] = useState(false);

  const lineRange = annotation.lineStart === annotation.lineEnd
    ? `line ${annotation.lineStart}`
    : `lines ${annotation.lineStart}-${annotation.lineEnd}`;
  const fileName = pathFileName(annotation.filePath);

  return (
    <div
      data-annotation-id={annotation.id}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'group w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        isSelected ? 'bg-surface-1 ring-1 ring-border/50' : 'hover:bg-surface-1/50',
      )}
    >
      {/* Header: type word, time on the right */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-micro font-semibold text-primary">Code</span>
        <span className="ml-auto shrink-0 text-micro text-muted-foreground/50">
          {formatTimestamp(annotation.createdAt)}
        </span>
      </div>

      {/* File / line meta */}
      <div className="rounded-sm px-2 py-1 bg-surface-1 font-mono text-micro text-muted-foreground truncate" title={annotation.filePath}>
        {fileName} · {lineRange}
      </div>

      {isEditing ? (
        <div className="mt-1.5">
          <InlineCommentEditor
            initialText={annotation.text ?? ''}
            onSave={(text) => {
              onEdit?.({ text });
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      ) : annotation.text && (
        <p className="mt-1.5 whitespace-pre-wrap text-body text-foreground/90">
          {annotation.text}
        </p>
      )}

      {annotation.images && annotation.images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {annotation.images.map((img) => (
            <div key={img.path} className="text-center">
              <ImageThumbnail path={img.path} size="sm" showRemove={false} />
              <div className="text-micro text-muted-foreground truncate max-w-12" title={img.name}>{img.name}</div>
            </div>
          ))}
        </div>
      )}

      {!isEditing && (
        <CardActions
          copyText={annotation.text || `${fileName} · ${lineRange}`}
          onEdit={!readOnly && onEdit ? () => setIsEditing(true) : undefined}
          onDelete={readOnly ? undefined : onDelete}
        />
      )}
    </div>
  );
};
