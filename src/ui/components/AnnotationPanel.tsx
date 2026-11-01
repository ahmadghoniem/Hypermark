import React, { useState, useRef, useEffect } from 'react';
import { AnnotationType, type Annotation, type Block } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import { OverlayScrollArea } from './OverlayScrollArea';
import { Button } from '../fluid/components/button';
import { Tooltip } from '../fluid/components/tooltip';
import { COMPOSER_TOOLTIP, CommentAttachStack } from './CommentAttachStack';
import { TabsSubtle, TabsSubtleItem } from '../fluid/components/tabs-subtle';
import { cn } from '../lib/utils';
import { copyTextToClipboard } from '../utils/clipboard';
import { formatRelativeTime, railPreview } from '../utils/messageRail';

import { Check, Copy01, Edit05, Plus, Trash01, XClose } from '@untitledui/icons';
export type AnnotationScope = 'this' | 'all';

export interface AnnotationMessageGroup {
  messageId: string;
  text: string;
  timestamp?: string;
  isCurrent?: boolean;
  annotations: Annotation[];
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

/** Tooltip on a panel button: above the mobile panel (z-panel) as well. */
const PanelTip: React.FC<{ label: string; children: React.ReactElement }> = ({ label, children }) => (
  <Tooltip content={label} side="top" className={COMPOSER_TOOLTIP} contentClassName="z-menu">
    {children}
  </Tooltip>
);

/** The card's footer: the actions on the right, always shown: copy always,
 *  edit and delete unless read-only. Edit opens the annotation's composer. */
const CardActions: React.FC<{
  copyText: string;
  onEdit?: () => void;
  onDelete?: () => void;
}> = ({ copyText, onEdit, onDelete }) => {
  const [copied, setCopied] = useState(false);
  const copyLabel = copied ? 'Copied' : 'Copy annotation';
  return (
    <div className="-mb-1.5 mt-0.5 flex items-center justify-end">
      <PanelTip label={copyLabel}>
        <Button
          variant="ghost"
          size="icon-compact"
          aria-label={copyLabel}
          className={cn(copied && 'text-success hover:text-success')}
          onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            if (!(await copyTextToClipboard(copyText))) return;
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy01 />}
        </Button>
      </PanelTip>
      {onEdit && (
        <PanelTip label="Edit annotation">
          <Button
            variant="ghost"
            size="icon-compact"
            aria-label="Edit annotation"
            data-annotation-open="true"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onEdit(); }}
          >
            <Edit05 />
          </Button>
        </PanelTip>
      )}
      {onDelete && (
        <PanelTip label="Delete annotation">
          <Button
            variant="ghost"
            size="icon-compact"
            aria-label="Delete annotation"
            className="hover:text-destructive"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash01 />
          </Button>
        </PanelTip>
      )}
    </div>
  );
};

interface PanelProps {
  isOpen: boolean;
  annotations: Annotation[];
  blocks: Block[];
  /** A card click: select the annotation. */
  onSelectAnnotation: (id: string, messageId?: string) => void;
  onDeleteAnnotation: (id: string) => void;
  /** The card's edit button: open the annotation's composer. */
  onOpenAnnotation?: (id: string, messageId?: string) => void;
  selectedId: string | null;
  scope?: AnnotationScope;
  onScopeChange?: (scope: AnnotationScope) => void;
  messageGroups?: AnnotationMessageGroup[];
  onClose?: () => void;
  /** Shows a + next to the title that opens the global comment composer,
   *  anchored to the button. */
  onAddGlobalComment?: (anchorEl: HTMLElement) => void;
  /** Shows a copy button next to the title, while there are annotations,
   *  that copies the full feedback. Resolving `false` skips the "Copied" state. */
  onCopyAll?: () => Promise<boolean>;
}

/** Header button that copies every annotation as the feedback text. */
const CopyAllButton: React.FC<{ onCopy: () => Promise<boolean> }> = ({ onCopy }) => {
  const [copied, setCopied] = useState(false);
  const label = copied ? 'Copied' : 'Copy all annotations';
  return (
    <PanelTip label={label}>
      <Button
        variant="ghost"
        size="icon-compact"
        aria-label={label}
        className={cn(copied && 'text-success hover:text-success')}
        onClick={async () => {
          if (!(await onCopy())) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check /> : <Copy01 />}
      </Button>
    </PanelTip>
  );
};

export const AnnotationPanel: React.FC<PanelProps> = ({
  isOpen,
  annotations,
  onSelectAnnotation,
  onDeleteAnnotation,
  onOpenAnnotation,
  selectedId,
  onClose,
  scope,
  onScopeChange,
  messageGroups,
  onAddGlobalComment,
  onCopyAll,
}) => {
  const isMobile = useIsMobile();
  const mobilePanel = isMobile;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (scope === 'all') setNow(Date.now());
  }, [scope]);
  const listRef = useRef<HTMLDivElement>(null);
  const sortedAnnotations = [...annotations].sort((a, b) => a.createdA - b.createdA);
  const totalCount = scope === 'all' && messageGroups
    ? messageGroups.reduce((acc, g) => acc + g.annotations.length, 0)
    : annotations.length;

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
      data-annotation-sidebar="right"
      className={`bg-surface-2 flex flex-col shrink-0 ${
        mobilePanel ? 'fixed top-12 bottom-0 right-0 z-panel w-full max-w-sm shadow-2xl' : 'border-l border-border/50'
      }`}
      style={mobilePanel ? undefined : { width: 288 }}
    >
      {/* Header */}
      <div>
        <div className="flex h-10 items-center justify-between gap-2 px-3">
          <div className="flex items-center gap-1">
            <h2 className="text-caption font-semibold text-foreground">
              Annotations
            </h2>
            {onAddGlobalComment && (
              <PanelTip label="Add global comment">
                <Button
                  variant="ghost"
                  size="icon-compact"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => onAddGlobalComment(e.currentTarget)}
                  aria-label="Add global comment"
                  data-global-comment-add="true"
                >
                  <Plus />
                </Button>
              </PanelTip>
            )}
            {onCopyAll && totalCount > 0 && <CopyAllButton onCopy={onCopyAll} />}
          </div>
          <div className="flex items-center gap-1">
            {scope && onScopeChange && (
              <TabsSubtle
                idPrefix="annotation-scope"
                aria-label="Annotation scope"
                size="compact"
                selectedIndex={scope === 'all' ? 1 : 0}
                onSelect={(index) => onScopeChange(index === 1 ? 'all' : 'this')}
              >
                <TabsSubtleItem index={0} label="Current" />
                <TabsSubtleItem index={1} label="All" />
              </TabsSubtle>
            )}
            {mobilePanel && onClose && (
              <PanelTip label="Close panel">
                <Button
                  variant="ghost"
                  size="icon-compact"
                  onClick={onClose}
                  aria-label="Close panel"
                  className="md:hidden"
                >
                  <XClose />
                </Button>
              </PanelTip>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <OverlayScrollArea className="flex-1 min-h-0">
        <div ref={listRef} className="p-2 flex flex-col gap-2">
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

              if (groupSortedAnnotations.length === 0) return null;

              const relTime = formatRelativeTime(group.timestamp, now);
              return (
                <div key={group.messageId} data-message-group={group.messageId} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 px-1 pt-2 pb-0.5 text-micro font-semibold text-muted-foreground">
                    <span className="truncate">{railPreview(group.text)}</span>
                    {relTime && (
                      <span className="shrink-0 text-micro text-muted-foreground/60">{relTime}</span>
                    )}
                  </div>
                  {groupSortedAnnotations.map((annotation) => (
                    <AnnotationCard
                      key={annotation.id}
                      annotation={annotation}
                      isSelected={selectedId === annotation.id}
                      onSelect={() => onSelectAnnotation(annotation.id, group.messageId)}
                      onDelete={() => onDeleteAnnotation(annotation.id)}
                      onOpen={onOpenAnnotation ? () => onOpenAnnotation(annotation.id, group.messageId) : undefined}
                      readOnly={!group.isCurrent}
                    />
                  ))}
                </div>
              );
            })}
          </>
        ) : (
          <>
            {sortedAnnotations.map((annotation) => (
              <AnnotationCard
                key={annotation.id}
                annotation={annotation}
                isSelected={selectedId === annotation.id}
                onSelect={() => onSelectAnnotation(annotation.id)}
                onDelete={() => onDeleteAnnotation(annotation.id)}
                onOpen={onOpenAnnotation ? () => onOpenAnnotation(annotation.id) : undefined}
              />
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
  onOpen?: () => void;
  readOnly?: boolean;
}> = ({ annotation, isSelected, onSelect, onDelete, onOpen, readOnly = false }) => {
  const typeColor = TYPE_COLOR[annotation.type] ?? 'text-muted-foreground';
  const typeLabel = TYPE_LABEL[annotation.type] ?? 'Note';
  const isGlobal = annotation.type === AnnotationType.GLOBAL_COMMENT;
  const canEdit = !readOnly && !!onOpen && annotation.type !== AnnotationType.DELETION;
  const copyText = annotation.type === AnnotationType.DELETION
    ? annotation.originalText ?? ''
    : annotation.text || annotation.originalText || '';

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
        // An element on the panel: surface 3 at rest, 4 hovered, 5 selected.
        // Named so the buttons inside, each its own `group`, don't take the card's hover.
        'group/card w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition-[background-color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        isSelected ? 'bg-surface-5 shadow-surface-3' : 'bg-surface-3 shadow-surface-2 hover:bg-surface-4',
      )}
    >
      {/* Header: type word + chips, time on the right */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={cn('text-micro font-semibold', typeColor)}>{typeLabel}</span>
        <span className="ml-auto shrink-0 text-micro text-muted-foreground/50">
          {formatTimestamp(annotation.createdA)}
        </span>
      </div>

      {/* Global Comment - show text directly */}
      {isGlobal ? (
        <p className="whitespace-pre-wrap wrap-anywhere text-body text-foreground/90">
          {annotation.text}
        </p>
      ) : (
        <>
          {/* Quote — the annotated text, behind the composer's quote bar */}
          <div className="mb-1.5 flex gap-2">
            <span aria-hidden="true" className="w-0.5 shrink-0 self-stretch rounded-full bg-muted-foreground/35" />
            <p
              className={cn(
                'line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere text-caption text-muted-foreground',
                annotation.type === AnnotationType.DELETION && 'line-through decoration-destructive/60',
              )}
            >
              {annotation.originalText}
            </p>
          </div>

          {/* Comment/Replacement Text */}
          {annotation.type !== AnnotationType.DELETION && annotation.text && (
            <p className="whitespace-pre-wrap wrap-anywhere text-body text-foreground/90">
              {annotation.text}
            </p>
          )}
        </>
      )}

      {/* Attached Images */}
      {annotation.images && annotation.images.length > 0 && (
        <CommentAttachStack images={annotation.images} className="mt-2" />
      )}

      <CardActions
        copyText={copyText}
        onEdit={canEdit ? onOpen : undefined}
        onDelete={readOnly ? undefined : onDelete}
      />
    </div>
  );
};
